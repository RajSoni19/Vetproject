-- REHEARSAL ONLY. Disposable cluster target: 127.0.0.1:55441/vtv_saas_dev. Precondition: no trial may have been issued. Business rows are
-- never removed; rollback refuses once the trial history is non-empty.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55441
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat/.trial-029-rehearsal/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.trial_history') IS NULL
 OR to_regprocedure('saas.owned_billing_accounts(text)') IS NULL
 OR EXISTS(SELECT 1 FROM saas.trial_history)
 OR EXISTS(SELECT 1 FROM saas.subscription_entitlements WHERE trial_started_at IS NOT NULL OR trial_expires_at IS NOT NULL OR trial_status IS NOT NULL)
 THEN RAISE EXCEPTION 'Rollback refused: target mismatch or an account has used a trial'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP TRIGGER entitlement_trial_history ON saas.subscription_entitlements;
DROP TRIGGER entitlement_trial_conversion ON saas.subscription_entitlements;
DROP FUNCTION saas.sync_trial_history();
DROP FUNCTION saas.mark_trial_converted();

CREATE OR REPLACE FUNCTION saas.authorized_company(target uuid,required text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT target::text=current_setting('app.company_id',true) AND EXISTS(
 SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN saas.company_profiles cp ON cp.company_id=m.company_id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.id=saas.current_session() AND m.status='active' AND cp.status='active' AND a.status='active');
$$;
CREATE OR REPLACE FUNCTION saas.lock_authorization(target uuid,required text) RETURNS TABLE(actor_id uuid,session_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF target::text IS DISTINCT FROM current_setting('app.company_id',true) THEN RETURN; END IF;
 RETURN QUERY SELECT u.id,s.id FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN web_auth.companies c ON c.id=m.company_id JOIN saas.company_profiles cp ON cp.company_id=c.id
 JOIN saas.billing_accounts a ON a.id=cp.account_id JOIN saas.company_roles r ON r.code=m.role
 JOIN saas.role_permissions rp ON rp.role_id=r.id JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.status='active' AND cp.status='active' AND a.status='active'
 FOR SHARE OF s,u,m,c,cp,a,r,rp,p;
END $$;

DROP FUNCTION saas.owned_billing_accounts(text);
CREATE FUNCTION saas.owned_billing_accounts(p_session_hash text) RETURNS TABLE(id uuid,status text,plan text,subscription_status text,company_limit integer,seat_limit integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT a.id,a.status,e.plan,e.status,e.company_limit,e.seat_limit FROM saas.billing_accounts a
 LEFT JOIN saas.subscription_entitlements e ON e.account_id=a.id
 WHERE session_user='vtv_web_runtime' AND EXISTS(SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.id=a.owner_id)
 ORDER BY a.created_at,a.id;
$$;
CREATE OR REPLACE FUNCTION saas.provision_company(p_session_hash text,p_name text,p_currency text,p_account uuid,p_key char(64),p_payload char(64)) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; sid uuid; selected_account uuid; account_state text; entitlement saas.subscription_entitlements; old saas.onboarding_commands; company uuid; answer jsonb; profile_state text='pending';
 BEGIN
  IF session_user<>'vtv_web_runtime' OR p_session_hash IS NULL OR p_session_hash!~'^[a-f0-9]{64}$'
   OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR p_name~'[[:cntrl:]]'
   OR p_currency IS NULL OR p_currency NOT IN('GBP','EUR','USD')
   OR p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR p_payload IS NULL OR p_payload!~'^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'Invalid onboarding command' USING ERRCODE='22023'; END IF;
  SELECT s.user_id,s.id INTO actor,sid FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL;
  IF actor IS NULL THEN RAISE EXCEPTION 'Verified session required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM web_auth.users WHERE id=actor AND status='active' AND email_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified identity required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM web_auth.sessions WHERE id=sid AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Live session required' USING ERRCODE='42501'; END IF;
  SELECT * INTO old FROM saas.onboarding_commands WHERE actor_id=actor AND key_hash=p_key;
  IF FOUND THEN IF old.payload_hash<>p_payload THEN RAISE EXCEPTION 'Onboarding reference conflict' USING ERRCODE='23505'; END IF; RETURN old.response; END IF;
  IF p_account IS NULL THEN
   IF EXISTS(SELECT 1 FROM saas.billing_accounts WHERE owner_id=actor) THEN RAISE EXCEPTION 'An owned billing account already exists; select it before adding a company' USING ERRCODE='23505'; END IF;
   INSERT INTO saas.billing_accounts(owner_id,status) VALUES(actor,'pending') RETURNING id INTO selected_account;
   INSERT INTO saas.billing_memberships(account_id,user_id,role,status) VALUES(selected_account,actor,'Owner','active');
  ELSE
   SELECT id,status INTO selected_account,account_state FROM saas.billing_accounts WHERE id=p_account AND owner_id=actor FOR UPDATE;
   IF selected_account IS NULL THEN RAISE EXCEPTION 'Owned billing account required' USING ERRCODE='42501'; END IF;
   SELECT * INTO entitlement FROM saas.subscription_entitlements WHERE account_id=selected_account FOR SHARE;
   IF account_state<>'active' OR entitlement.status IS DISTINCT FROM 'active' OR entitlement.verified_at IS NULL OR entitlement.source_reference IS NULL THEN
    RAISE EXCEPTION 'Verified active entitlement required' USING ERRCODE='42501'; END IF;
   IF (SELECT count(*) FROM saas.company_profiles WHERE account_id=selected_account AND status<>'archived')>=entitlement.company_limit THEN
    RAISE EXCEPTION 'Company allowance reached' USING ERRCODE='23505'; END IF;
   profile_state='active';
  END IF;
  INSERT INTO web_auth.companies(name,owner_id) VALUES(btrim(p_name),actor) RETURNING id INTO company;
  INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES(actor,company,'Owner','active');
  INSERT INTO saas.company_profiles(company_id,account_id,currency,status) VALUES(company,selected_account,p_currency,profile_state);
  INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,company,'company.onboarded',jsonb_build_object('status',profile_state));
  answer=jsonb_build_object('id',company,'name',btrim(p_name),'accountId',selected_account,'status',profile_state,'paymentConfirmed',false);
  INSERT INTO saas.onboarding_commands(actor_id,key_hash,payload_hash,response) VALUES(actor,p_key,p_payload,answer);
  RETURN answer;
 END $$;
GRANT EXECUTE ON FUNCTION saas.owned_billing_accounts(text) TO vtv_web_runtime;
ALTER TABLE saas.subscription_entitlements DROP CONSTRAINT subscription_entitlements_trial_check;
ALTER TABLE saas.subscription_entitlements DROP COLUMN trial_status,DROP COLUMN trial_expires_at,DROP COLUMN trial_started_at;
REVOKE ALL ON TABLE saas.trial_history FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime,vtv_saas_owner;
DROP POLICY owner_trial_history ON saas.trial_history;
DROP TABLE saas.trial_history;
RESET ROLE;
COMMIT;

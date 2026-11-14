-- REHEARSAL ONLY. Disposable cluster target: 127.0.0.1:55441/vtv_saas_dev. Replaces the unapproved local-test entitlement draft.
-- One no-card 14-day Starter-feature trial per verified web-auth user, started
-- transactionally with first-company onboarding. This is not payment evidence.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55441
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat/.trial-029-rehearsal/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.onboarding_commands') IS NULL
 OR to_regprocedure('saas.provision_company(text,text,text,uuid,character,character)') IS NULL
 OR to_regprocedure('saas.owned_billing_accounts(text)') IS NULL
 OR to_regprocedure('saas.authorized_company(uuid,text)') IS NULL
 OR to_regprocedure('saas.lock_authorization(uuid,text)') IS NULL
 OR to_regclass('saas.trial_history') IS NOT NULL
 OR to_regclass('saas.local_test_entitlement_grants') IS NOT NULL
 OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='subscription_entitlements' AND column_name IN('trial_started_at','trial_expires_at','trial_status'))
 THEN RAISE EXCEPTION 'Unapproved target, existing trial draft, or missing prerequisites'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
ALTER TABLE saas.subscription_entitlements
 ADD COLUMN trial_started_at timestamptz,
 ADD COLUMN trial_expires_at timestamptz,
 ADD COLUMN trial_status text,
 ADD CONSTRAINT subscription_entitlements_trial_check CHECK(
  (trial_status IS NULL AND trial_started_at IS NULL AND trial_expires_at IS NULL)
  OR (trial_status IS NOT NULL AND trial_status IN('active','expired','converted') AND trial_started_at IS NOT NULL AND trial_expires_at IS NOT NULL AND trial_expires_at=trial_started_at+interval '14 days')
 );
CREATE TABLE saas.trial_history(
 actor_id uuid PRIMARY KEY REFERENCES web_auth.users(id),
 account_id uuid NOT NULL UNIQUE REFERENCES saas.billing_accounts(id),
 started_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at=started_at+interval '14 days'),
 status text NOT NULL CHECK(status IN('active','expired','converted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE saas.trial_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.trial_history FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_trial_history ON saas.trial_history TO vtv_saas_owner USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON saas.trial_history TO vtv_saas_owner;

CREATE FUNCTION saas.sync_trial_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.trial_status IS DISTINCT FROM OLD.trial_status THEN
  UPDATE saas.trial_history SET status=NEW.trial_status,updated_at=clock_timestamp() WHERE account_id=NEW.account_id;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION saas.mark_trial_converted() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='active' AND NEW.source_reference LIKE 'stripe-test:%' AND OLD.trial_status IN('active','expired') THEN NEW.trial_status='converted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER entitlement_trial_conversion BEFORE UPDATE OF status,source_reference ON saas.subscription_entitlements
 FOR EACH ROW EXECUTE FUNCTION saas.mark_trial_converted();
CREATE TRIGGER entitlement_trial_history AFTER UPDATE ON saas.subscription_entitlements
 FOR EACH ROW WHEN(OLD.trial_status IS DISTINCT FROM NEW.trial_status) EXECUTE FUNCTION saas.sync_trial_history();

CREATE OR REPLACE FUNCTION saas.authorized_company(target uuid,required text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT target::text=current_setting('app.company_id',true) AND EXISTS(
 SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN saas.company_profiles cp ON cp.company_id=m.company_id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.subscription_entitlements e ON e.account_id=a.id AND e.status='active' AND e.verified_at IS NOT NULL AND e.source_reference IS NOT NULL
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.id=saas.current_session() AND m.status='active' AND cp.status='active' AND a.status='active'
 AND (e.trial_status IS NULL OR e.trial_status='converted' OR (e.trial_status='active' AND e.trial_expires_at>statement_timestamp())
  OR required=ANY(ARRAY['audit:read','banking:read','company:read','contacts:read','documents:read','inventory:read','invoices:read','procurement:read','reports:export','reports:read','sales:read']::text[])));
$$;
CREATE OR REPLACE FUNCTION saas.lock_authorization(target uuid,required text) RETURNS TABLE(actor_id uuid,session_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF target::text IS DISTINCT FROM current_setting('app.company_id',true) THEN RETURN; END IF;
 RETURN QUERY SELECT u.id,s.id FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN web_auth.companies c ON c.id=m.company_id
 JOIN saas.company_profiles cp ON cp.company_id=c.id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.subscription_entitlements e ON e.account_id=a.id AND e.status='active' AND e.verified_at IS NOT NULL AND e.source_reference IS NOT NULL
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
 AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.status='active' AND cp.status='active' AND a.status='active'
 AND (e.trial_status IS NULL OR e.trial_status='converted' OR (e.trial_status='active' AND e.trial_expires_at>statement_timestamp())
  OR required=ANY(ARRAY['audit:read','banking:read','company:read','contacts:read','documents:read','inventory:read','invoices:read','procurement:read','reports:export','reports:read','sales:read']::text[]))
 FOR SHARE OF s,u,m,c,cp,a,e,r,rp,p;
END $$;

CREATE OR REPLACE FUNCTION saas.provision_company(p_session_hash text,p_name text,p_currency text,p_account uuid,p_key char(64),p_payload char(64)) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; sid uuid; selected_account uuid; account_state text; entitlement saas.subscription_entitlements; old saas.onboarding_commands; company uuid; answer jsonb; profile_state text='pending'; trial_start timestamptz; trial_end timestamptz;
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
   IF EXISTS(SELECT 1 FROM saas.billing_accounts WHERE owner_id=actor) OR EXISTS(SELECT 1 FROM saas.trial_history WHERE actor_id=actor) THEN
    RAISE EXCEPTION 'An owned billing account already exists; select it before adding a company' USING ERRCODE='23505'; END IF;
   INSERT INTO saas.billing_accounts(owner_id,status) VALUES(actor,'pending') RETURNING id INTO selected_account;
   INSERT INTO saas.billing_memberships(account_id,user_id,role,status) VALUES(selected_account,actor,'Owner','active');
   trial_start=clock_timestamp(); trial_end=trial_start+interval '14 days'; profile_state='active';
   UPDATE saas.billing_accounts SET status='active',version=version+1 WHERE id=selected_account AND status='pending';
   INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference,trial_started_at,trial_expires_at,trial_status)
    VALUES(selected_account,'Starter','active',100,2,4,180,true,trial_start,'automatic-trial-14-day:'||selected_account::text,trial_start,trial_end,'active');
   INSERT INTO saas.trial_history(actor_id,account_id,started_at,expires_at,status) VALUES(actor,selected_account,trial_start,trial_end,'active');
  ELSE
   SELECT id,status INTO selected_account,account_state FROM saas.billing_accounts WHERE id=p_account AND owner_id=actor FOR UPDATE;
   IF selected_account IS NULL THEN RAISE EXCEPTION 'Owned billing account required' USING ERRCODE='42501'; END IF;
   SELECT * INTO entitlement FROM saas.subscription_entitlements WHERE account_id=selected_account FOR SHARE;
   IF account_state<>'active' OR entitlement.status IS DISTINCT FROM 'active' OR entitlement.verified_at IS NULL OR entitlement.source_reference IS NULL
    OR entitlement.trial_status='expired' OR (entitlement.trial_status='active' AND entitlement.trial_expires_at<=statement_timestamp())
    THEN RAISE EXCEPTION 'An active unexpired trial or verified paid entitlement is required' USING ERRCODE='42501'; END IF;
   IF (SELECT count(*) FROM saas.company_profiles WHERE account_id=selected_account AND status<>'archived')>=entitlement.company_limit THEN
    RAISE EXCEPTION 'Company allowance reached' USING ERRCODE='23505'; END IF;
   profile_state='active';
  END IF;
  INSERT INTO web_auth.companies(name,owner_id) VALUES(btrim(p_name),actor) RETURNING id INTO company;
  INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES(actor,company,'Owner','active');
  INSERT INTO saas.company_profiles(company_id,account_id,currency,status) VALUES(company,selected_account,p_currency,profile_state);
  INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,company,'company.onboarded',jsonb_build_object('status',profile_state,'trialStartedAt',trial_start,'trialExpiresAt',trial_end,'trialStatus',CASE WHEN trial_start IS NULL THEN NULL ELSE 'active' END,'paymentConfirmed',false));
  answer=jsonb_build_object('id',company,'name',btrim(p_name),'accountId',selected_account,'status',profile_state,'trialStartedAt',trial_start,'trialExpiresAt',trial_end,'trialStatus',CASE WHEN trial_start IS NULL THEN NULL ELSE 'active' END,'trialDays',CASE WHEN trial_start IS NULL THEN NULL ELSE 14 END,'orsIncluded',CASE WHEN trial_start IS NULL THEN entitlement.ors_enabled ELSE true END,'paymentConfirmed',false);
  INSERT INTO saas.onboarding_commands(actor_id,key_hash,payload_hash,response) VALUES(actor,p_key,p_payload,answer);
  RETURN answer;
 END $$;

DROP FUNCTION saas.owned_billing_accounts(text);
CREATE FUNCTION saas.owned_billing_accounts(p_session_hash text) RETURNS TABLE(id uuid,status text,plan text,subscription_status text,company_limit integer,seat_limit integer,trial_started_at timestamptz,trial_expires_at timestamptz,trial_status text,ors_enabled boolean)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid;
 BEGIN
  actor=saas.team_identity(p_session_hash);
  UPDATE saas.subscription_entitlements e SET trial_status='expired',version=e.version+1
   FROM saas.billing_accounts a WHERE e.account_id=a.id AND a.owner_id=actor AND e.trial_status='active' AND e.trial_expires_at<=statement_timestamp();
  RETURN QUERY SELECT a.id,a.status,CASE WHEN e.trial_status IN('active','expired') THEN 'Trial' ELSE e.plan END,
   CASE WHEN e.trial_status='active' AND e.trial_expires_at<=statement_timestamp() THEN 'expired' WHEN e.trial_status IN('active','expired') THEN e.trial_status ELSE e.status END,
   e.company_limit,e.seat_limit,e.trial_started_at,e.trial_expires_at,e.trial_status,e.ors_enabled
  FROM saas.billing_accounts a LEFT JOIN saas.subscription_entitlements e ON e.account_id=a.id WHERE a.owner_id=actor ORDER BY a.created_at,a.id;
 END $$;

REVOKE ALL ON TABLE saas.trial_history FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON FUNCTION saas.sync_trial_history(),saas.mark_trial_converted(),saas.owned_billing_accounts(text) FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION saas.owned_billing_accounts(text) TO vtv_web_runtime;
RESET ROLE;
COMMIT;

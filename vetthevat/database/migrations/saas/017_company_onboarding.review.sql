-- REVIEW ONLY. Requires separate exact-checksum approval. Never run at startup.
-- Verified identities may reserve ONE pending account/company without a paid
-- entitlement. Such reservations grant NO business access. Additional companies
-- require an existing active, verified entitlement and an owned billing account.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.onboarding_commands') IS NOT NULL
 OR to_regclass('business.bank_allocations') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND policyname='owner_bank_allocation_lock')
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite or existing onboarding objects'; END IF;
END $$;
-- No direct application table grants. Only the narrow definer command may use
-- these owner grants, and it resolves the actor from a live session hash.
GRANT INSERT ON web_auth.companies,web_auth.company_memberships,web_auth.audit_logs TO vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE saas.onboarding_commands(
 actor_id uuid NOT NULL REFERENCES web_auth.users(id),key_hash char(64) NOT NULL CHECK(key_hash~'^[a-f0-9]{64}$'),
 payload_hash char(64) NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor_id,key_hash));
ALTER TABLE saas.onboarding_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.onboarding_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_onboarding ON saas.onboarding_commands TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_account_provision ON saas.billing_accounts FOR INSERT TO vtv_saas_owner WITH CHECK(status='pending');
CREATE POLICY owner_billing_member_provision ON saas.billing_memberships FOR INSERT TO vtv_saas_owner WITH CHECK(role='Owner' AND status='active');
CREATE POLICY owner_profile_provision ON saas.company_profiles FOR INSERT TO vtv_saas_owner WITH CHECK(status IN('pending','active'));
CREATE POLICY owner_account_onboarding_lock ON saas.billing_accounts FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
CREATE POLICY owner_entitlement_onboarding_lock ON saas.subscription_entitlements FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
CREATE FUNCTION saas.provision_company(p_session_hash text,p_name text,p_currency text,p_account uuid,p_key char(64),p_payload char(64)) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; sid uuid; selected_account uuid; account_state text; entitlement saas.subscription_entitlements; old saas.onboarding_commands; company uuid; answer jsonb; profile_state text='pending';
 BEGIN
  IF session_user<>'vtv_web_runtime' OR p_session_hash IS NULL OR p_session_hash!~'^[a-f0-9]{64}$'
   OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR p_name~'[[:cntrl:]]'
   OR p_currency IS NULL OR p_currency NOT IN('GBP','EUR','USD')
   OR p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR p_payload IS NULL OR p_payload!~'^[a-f0-9]{64}$'
   THEN RAISE EXCEPTION 'Invalid onboarding command' USING ERRCODE='22023'; END IF;
  -- Match the lock order used by identity password/session operations.
  SELECT s.user_id,s.id INTO actor,sid FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
   WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL;
  IF actor IS NULL THEN RAISE EXCEPTION 'Verified session required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM web_auth.users WHERE id=actor AND status='active' AND email_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified identity required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM web_auth.sessions WHERE id=sid AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Live session required' USING ERRCODE='42501'; END IF;
  SELECT * INTO old FROM saas.onboarding_commands WHERE actor_id=actor AND key_hash=p_key;
  IF FOUND THEN
   IF old.payload_hash<>p_payload THEN RAISE EXCEPTION 'Onboarding reference conflict' USING ERRCODE='23505'; END IF;
   RETURN old.response;
  END IF;
  IF p_account IS NULL THEN
   -- Serialize on the verified user above. A retry cannot create another account.
   IF EXISTS(SELECT 1 FROM saas.billing_accounts WHERE owner_id=actor) THEN
    RAISE EXCEPTION 'An owned billing account already exists; select it before adding a company' USING ERRCODE='23505'; END IF;
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
CREATE FUNCTION saas.owned_billing_accounts(p_session_hash text) RETURNS TABLE(id uuid,status text,plan text,subscription_status text,company_limit integer,seat_limit integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT a.id,a.status,e.plan,e.status,e.company_limit,e.seat_limit FROM saas.billing_accounts a
 LEFT JOIN saas.subscription_entitlements e ON e.account_id=a.id
 WHERE session_user='vtv_web_runtime' AND EXISTS(SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=p_session_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.id=a.owner_id)
 ORDER BY a.created_at,a.id;
$$;
REVOKE ALL ON TABLE saas.onboarding_commands FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON FUNCTION saas.provision_company(text,text,text,uuid,char(64),char(64)),saas.owned_billing_accounts(text) FROM PUBLIC,vtv_saas_runtime;
RESET ROLE;
GRANT USAGE ON SCHEMA saas TO vtv_web_runtime;
GRANT EXECUTE ON FUNCTION saas.provision_company(text,text,text,uuid,char(64),char(64)),saas.owned_billing_accounts(text) TO vtv_web_runtime;
COMMIT;

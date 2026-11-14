-- REVIEW ONLY. No startup execution. Explicit approval required for live dev.
-- No identity, administrator, password, package, payment or tenant data is seeded.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regprocedure('saas.team_identity(text)') IS NULL OR to_regnamespace('platform_admin') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved platform administration target'; END IF;
END $$;
CREATE SCHEMA platform_admin AUTHORIZATION vtv_saas_owner;
-- Only these directory columns are needed; never grant password/reset access.
GRANT SELECT(full_name,email,created_at) ON web_auth.users TO vtv_saas_owner;
GRANT SELECT(created_at) ON web_auth.companies TO vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform_admin REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE platform_admin.grants(
 user_id uuid PRIMARY KEY REFERENCES web_auth.users(id),
 role text NOT NULL CHECK(role IN('Super Admin','Billing Admin','Support Agent','Sales Agent','Read-only Auditor')),
 active boolean NOT NULL DEFAULT true,version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.factors(user_id uuid PRIMARY KEY REFERENCES platform_admin.grants(user_id),secret bytea NOT NULL CHECK(octet_length(secret)=32),verified boolean NOT NULL DEFAULT false,last_step bigint NOT NULL DEFAULT -1,failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),locked_until timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.mfa_sessions(session_id uuid PRIMARY KEY REFERENCES web_auth.sessions(id),user_id uuid NOT NULL REFERENCES platform_admin.grants(user_id),verified_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
CREATE TABLE platform_admin.audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES web_auth.users(id),action text NOT NULL CHECK(length(action)<=100),target_id uuid,reason text NOT NULL DEFAULT '' CHECK(length(reason)<=500),details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX platform_audit_date ON platform_admin.audit(created_at DESC,id);
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_admin.audit FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TABLE platform_admin.commands(actor_id uuid NOT NULL REFERENCES web_auth.users(id),key text NOT NULL CHECK(key~'^[a-f0-9]{64}$'),request jsonb NOT NULL,response jsonb,PRIMARY KEY(actor_id,key));
CREATE TABLE platform_admin.plans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),price numeric(12,2) NOT NULL CHECK(price>=0),interval text NOT NULL CHECK(interval IN('month','year')),invoice_limit integer NOT NULL CHECK(invoice_limit>0),ocr_limit integer NOT NULL CHECK(ocr_limit>0),company_limit integer NOT NULL CHECK(company_limit>0),seat_limit integer NOT NULL CHECK(seat_limit>0),ors_enabled boolean NOT NULL,archived boolean NOT NULL DEFAULT false,version bigint NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.lead_details(lead_id uuid PRIMARY KEY REFERENCES contact_intake.enquiries(id),stage text NOT NULL DEFAULT 'new' CHECK(stage IN('new','contacted','qualified','proposal','won','lost')),assignee_id uuid REFERENCES platform_admin.grants(user_id),notes text NOT NULL DEFAULT '' CHECK(length(notes)<=5000),remind_at timestamptz,company_id uuid REFERENCES web_auth.companies(id),version bigint NOT NULL DEFAULT 1);
CREATE TABLE platform_admin.ticket_details(ticket_id uuid PRIMARY KEY REFERENCES support_desk.tickets(id),priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),assignee_id uuid REFERENCES platform_admin.grants(user_id),escalated boolean NOT NULL DEFAULT false,version bigint NOT NULL DEFAULT 1);
CREATE TABLE platform_admin.ticket_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id uuid NOT NULL REFERENCES support_desk.tickets(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER platform_notes_immutable BEFORE UPDATE OR DELETE ON platform_admin.ticket_notes FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TABLE platform_admin.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES web_auth.users(id),title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE TABLE platform_admin.settings(key text PRIMARY KEY CHECK(key IN('support_email','support_hours','billing_notice')),value text NOT NULL CHECK(length(value)<=2000),version bigint NOT NULL DEFAULT 1);
CREATE TABLE platform_admin.contracts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL UNIQUE REFERENCES saas.billing_accounts(id),plan_id uuid NOT NULL REFERENCES platform_admin.plans(id),terms jsonb NOT NULL,
 status text NOT NULL CHECK(status IN('active','past_due','expired','cancelled')),period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,grace_until timestamptz NOT NULL,
 cancel_at_end boolean NOT NULL DEFAULT false,scheduled_plan_id uuid REFERENCES platform_admin.plans(id),version bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),CHECK(period_end>period_start),CHECK(grace_until>=period_start));
CREATE TABLE platform_admin.billing_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES platform_admin.contracts(id),account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),reference text NOT NULL UNIQUE,period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),amount numeric(12,2) NOT NULL CHECK(amount>=0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(contract_id,period_start),CHECK(period_end>period_start));
CREATE TABLE platform_admin.receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES platform_admin.billing_invoices(id),amount numeric(12,2) NOT NULL CHECK(amount>0),currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),external_reference text NOT NULL UNIQUE CHECK(length(external_reference) BETWEEN 5 AND 200),received_at timestamptz NOT NULL,actor_id uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.billing_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),kind text NOT NULL CHECK(kind IN('change_plan','cancel')),plan_id uuid REFERENCES platform_admin.plans(id),message text NOT NULL CHECK(length(message) BETWEEN 5 AND 2000),state text NOT NULL DEFAULT 'open' CHECK(state IN('open','acknowledged','closed')),version bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.billing_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),action text NOT NULL,target_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_admin.billing_reminders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contract_id uuid NOT NULL REFERENCES platform_admin.contracts(id),period_end timestamptz NOT NULL,kind text NOT NULL CHECK(kind IN('renewal','past_due')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(contract_id,period_end,kind));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['billing_invoices','receipts','billing_events'] LOOP
 EXECUTE format('CREATE TRIGGER platform_billing_immutable BEFORE UPDATE OR DELETE ON platform_admin.%I FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change()',t);
END LOOP;END $$;
ALTER TABLE saas.subscription_entitlements ADD COLUMN platform_plan_id uuid REFERENCES platform_admin.plans(id);
-- Retain the original fixed-plan constraint for every existing entitlement.
-- Custom entitlements must additionally match the contract snapshot trigger.
ALTER TABLE saas.subscription_entitlements DROP CONSTRAINT subscription_entitlements_check;
ALTER TABLE saas.subscription_entitlements ADD CONSTRAINT subscription_entitlements_check CHECK(status<>'active' OR (verified_at IS NOT NULL AND source_reference IS NOT NULL AND length(source_reference) BETWEEN 1 AND 200 AND plan IS NOT NULL AND invoices_per_month IS NOT NULL AND company_limit IS NOT NULL AND seat_limit IS NOT NULL AND (platform_plan_id IS NOT NULL OR ((plan='Basic' AND invoices_per_month=30 AND company_limit=2 AND seat_limit=2 AND history_days IS NOT NULL AND history_days=90) OR (plan='Starter' AND invoices_per_month=100 AND company_limit=2 AND seat_limit=4 AND history_days IS NOT NULL AND history_days=180 AND ors_enabled) OR (plan='Growth' AND invoices_per_month=300 AND company_limit=3 AND seat_limit=6 AND history_days IS NULL AND ors_enabled)))));
CREATE POLICY platform_profile_state ON saas.company_profiles FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(true);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['grants','factors','mfa_sessions','audit','commands','plans','lead_details','ticket_details','ticket_notes','notifications','settings','contracts','billing_invoices','receipts','billing_requests','billing_events','billing_reminders'] LOOP
 EXECUTE format('ALTER TABLE platform_admin.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE platform_admin.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_commands ON platform_admin.%I TO vtv_saas_owner USING(true) WITH CHECK(true)',t);
END LOOP; END $$;
CREATE FUNCTION platform_admin.contract_gate(p_account uuid,p_required text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM platform_admin.contracts WHERE account_id=p_account)
 OR p_required=ANY(ARRAY['audit:read','banking:read','company:read','contacts:read','documents:read','inventory:read','invoices:read','procurement:read','reports:export','reports:read','sales:read']::text[])
 OR EXISTS(SELECT 1 FROM platform_admin.contracts WHERE account_id=p_account AND NOT (status='cancelled') AND ((status='active' AND period_end>statement_timestamp()) OR (status='past_due' AND grace_until>statement_timestamp())));
$$;
CREATE FUNCTION platform_admin.entitlement_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c platform_admin.contracts;BEGIN
 SELECT * INTO c FROM platform_admin.contracts WHERE account_id=NEW.account_id;
 IF NEW.platform_plan_id IS NOT NULL OR c.id IS NOT NULL THEN
  IF c.id IS NULL OR NEW.platform_plan_id IS DISTINCT FROM c.plan_id OR NEW.invoices_per_month IS DISTINCT FROM (c.terms->>'invoice_limit')::int OR NEW.company_limit IS DISTINCT FROM (c.terms->>'company_limit')::int OR NEW.seat_limit IS DISTINCT FROM (c.terms->>'seat_limit')::int OR NEW.ors_enabled IS DISTINCT FROM (c.terms->>'ors_enabled')::boolean THEN RAISE EXCEPTION 'Entitlement does not match reviewed contract' USING ERRCODE='23514';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_contract_snapshot BEFORE INSERT OR UPDATE ON saas.subscription_entitlements FOR EACH ROW EXECUTE FUNCTION platform_admin.entitlement_snapshot();
CREATE FUNCTION platform_admin.document_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid;allowance int;used bigint;month_start timestamptz;BEGIN
 SELECT account_id INTO account FROM saas.company_profiles WHERE company_id=NEW.company_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(account::text,7143));
 SELECT coalesce((SELECT (terms->>'ocr_limit')::int FROM platform_admin.contracts WHERE account_id=account),invoices_per_month) INTO allowance FROM saas.subscription_entitlements WHERE account_id=account;
 month_start=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT count(*) INTO used FROM saas.documents d JOIN saas.company_profiles p ON p.company_id=d.company_id WHERE p.account_id=account AND d.created_at>=month_start;
 IF allowance IS NULL OR used>=allowance THEN RAISE EXCEPTION 'Monthly document OCR allowance reached' USING ERRCODE='23514',CONSTRAINT='platform_document_quota';END IF;
 NEW.created_at=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER platform_new_document_quota BEFORE INSERT ON saas.documents FOR EACH ROW EXECUTE FUNCTION platform_admin.document_quota();
-- Preserve the existing tenant, trial and permission checks, adding the
-- contract's time-based gate directly to both RLS and locked authorization.
CREATE OR REPLACE FUNCTION saas.authorized_company(target uuid,required text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT target::text=current_setting('app.company_id',true) AND EXISTS(
 SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN saas.company_profiles cp ON cp.company_id=m.company_id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.subscription_entitlements e ON e.account_id=a.id AND e.status='active' AND e.verified_at IS NOT NULL AND e.source_reference IS NOT NULL
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.id=saas.current_session() AND m.status='active' AND cp.status='active' AND a.status='active'
 AND platform_admin.contract_gate(a.id,required)
 AND (e.trial_status IS NULL OR e.trial_status='converted' OR (e.trial_status='active' AND e.trial_expires_at>statement_timestamp()) OR required=ANY(ARRAY['audit:read','banking:read','company:read','contacts:read','documents:read','inventory:read','invoices:read','procurement:read','reports:export','reports:read','sales:read']::text[])));
$$;
CREATE OR REPLACE FUNCTION saas.lock_authorization(target uuid,required text) RETURNS TABLE(actor_id uuid,session_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF target::text IS DISTINCT FROM current_setting('app.company_id',true) THEN RETURN;END IF;
 PERFORM 1 FROM platform_admin.contracts k JOIN saas.company_profiles cp ON cp.account_id=k.account_id WHERE cp.company_id=target FOR SHARE OF k;
 RETURN QUERY SELECT u.id,s.id FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target JOIN web_auth.companies c ON c.id=m.company_id
 JOIN saas.company_profiles cp ON cp.company_id=c.id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.subscription_entitlements e ON e.account_id=a.id AND e.status='active' AND e.verified_at IS NOT NULL AND e.source_reference IS NOT NULL
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
 AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.status='active' AND cp.status='active' AND a.status='active'
 AND platform_admin.contract_gate(a.id,required)
 AND (e.trial_status IS NULL OR e.trial_status='converted' OR (e.trial_status='active' AND e.trial_expires_at>statement_timestamp()) OR required=ANY(ARRAY['audit:read','banking:read','company:read','contacts:read','documents:read','inventory:read','invoices:read','procurement:read','reports:export','reports:read','sales:read']::text[]))
 FOR SHARE OF s,u,m,c,cp,a,e,r,rp,p;
END $$;
CREATE OR REPLACE FUNCTION saas.owned_billing_accounts(p_session_hash text) RETURNS TABLE(id uuid,status text,plan text,subscription_status text,company_limit integer,seat_limit integer,trial_started_at timestamptz,trial_expires_at timestamptz,trial_status text,ors_enabled boolean)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 actor=saas.team_identity(p_session_hash);
 UPDATE saas.subscription_entitlements e SET trial_status='expired',version=e.version+1 FROM saas.billing_accounts a WHERE e.account_id=a.id AND a.owner_id=actor AND e.trial_status='active' AND e.trial_expires_at<=statement_timestamp();
 RETURN QUERY SELECT a.id,a.status,CASE WHEN c.id IS NOT NULL THEN c.terms->>'name' WHEN e.trial_status IN('active','expired') THEN 'Trial' ELSE e.plan END,
 CASE WHEN c.id IS NOT NULL THEN CASE WHEN c.status='active' AND c.period_end<=now() OR c.status='past_due' AND c.grace_until<=now() THEN 'expired' ELSE c.status END WHEN e.trial_status='active' AND e.trial_expires_at<=statement_timestamp() THEN 'expired' WHEN e.trial_status IN('active','expired') THEN e.trial_status ELSE e.status END,
 e.company_limit,e.seat_limit,e.trial_started_at,e.trial_expires_at,e.trial_status,e.ors_enabled
 FROM saas.billing_accounts a LEFT JOIN saas.subscription_entitlements e ON e.account_id=a.id LEFT JOIN platform_admin.contracts c ON c.account_id=a.id WHERE a.owner_id=actor ORDER BY a.created_at,a.id;
END $$;
-- RFC 6238 HMAC-SHA256, using built-in SHA256 (no extension or external API).
CREATE FUNCTION platform_admin.totp(p_secret bytea,p_step bigint) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE inner_pad bytea=decode(repeat('00',64),'hex');outer_pad bytea=decode(repeat('00',64),'hex');digest bytea;offset_n int;n bigint;i int;k int;BEGIN
 IF octet_length(p_secret)<>32 OR p_step<0 THEN RETURN NULL; END IF;
 FOR i IN 0..63 LOOP k=CASE WHEN i<32 THEN get_byte(p_secret,i) ELSE 0 END;inner_pad=set_byte(inner_pad,i,k # 54);outer_pad=set_byte(outer_pad,i,k # 92);END LOOP;
 digest=sha256(outer_pad||sha256(inner_pad||int8send(p_step)));offset_n=get_byte(digest,31)&15;
 n=((get_byte(digest,offset_n)&127)::bigint<<24)|(get_byte(digest,offset_n+1)::bigint<<16)|(get_byte(digest,offset_n+2)::bigint<<8)|get_byte(digest,offset_n+3)::bigint;
 RETURN lpad((n%1000000)::text,6,'0');
END $$;
CREATE FUNCTION platform_admin.identity(p_hash text,p_mfa boolean DEFAULT true) RETURNS TABLE(actor uuid,role_name text,sid uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid; r text;s uuid;BEGIN
 a=saas.team_identity(p_hash);
 SELECT g.role INTO r FROM platform_admin.grants g WHERE g.user_id=a AND g.active FOR SHARE;
 IF r IS NULL THEN RAISE EXCEPTION 'Platform permission required' USING ERRCODE='42501';END IF;
 SELECT id INTO s FROM web_auth.sessions WHERE token_hash=p_hash AND user_id=a;
 IF p_mfa AND NOT EXISTS(SELECT 1 FROM platform_admin.mfa_sessions m WHERE m.session_id=s AND m.user_id=a AND m.expires_at>now()) THEN RAISE EXCEPTION 'MFA verification required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT a,r,s;
END $$;
CREATE FUNCTION platform_admin.security(p_hash text,p_action text,p_secret bytea DEFAULT NULL,p_code text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;f platform_admin.factors;step_n bigint;matched bigint;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash,false);
 SELECT * INTO f FROM platform_admin.factors WHERE user_id=who.actor FOR UPDATE;
 IF p_action='status' THEN RETURN jsonb_build_object('role',who.role_name,'enrolled',coalesce(f.verified,false),'verified',EXISTS(SELECT 1 FROM platform_admin.mfa_sessions WHERE session_id=who.sid AND expires_at>now()));END IF;
 IF p_action='enroll' THEN
  IF coalesce(f.verified,false) OR p_secret IS NULL OR octet_length(p_secret)<>32 THEN RAISE EXCEPTION 'MFA enrollment unavailable' USING ERRCODE='22023';END IF;
  INSERT INTO platform_admin.factors(user_id,secret) VALUES(who.actor,p_secret) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,last_step=-1,created_at=now();
  INSERT INTO platform_admin.audit(actor_id,action) VALUES(who.actor,'mfa.enrollment.started');RETURN jsonb_build_object('enrolled',false);
 END IF;
 IF p_action='verify' AND f.user_id IS NOT NULL AND p_code~'^[0-9]{6}$' THEN
  IF f.locked_until>clock_timestamp() THEN RETURN jsonb_build_object('verified',false);END IF;
  step_n=floor(extract(epoch FROM clock_timestamp())/30)::bigint;
  SELECT x INTO matched FROM generate_series(step_n-1,step_n+1) x WHERE x>f.last_step AND platform_admin.totp(f.secret,x)=p_code ORDER BY x LIMIT 1;
  IF matched IS NOT NULL THEN
   UPDATE platform_admin.factors SET verified=true,last_step=matched,failed_attempts=0,locked_until=NULL WHERE user_id=who.actor;
   INSERT INTO platform_admin.mfa_sessions(session_id,user_id,expires_at) VALUES(who.sid,who.actor,now()+interval '15 minutes') ON CONFLICT(session_id) DO UPDATE SET verified_at=now(),expires_at=excluded.expires_at;
   INSERT INTO platform_admin.audit(actor_id,action) VALUES(who.actor,'mfa.verified');RETURN jsonb_build_object('verified',true);
  END IF;
  UPDATE platform_admin.factors SET failed_attempts=CASE WHEN locked_until IS NOT NULL THEN 1 ELSE least(failed_attempts+1,5) END,locked_until=CASE WHEN locked_until IS NULL AND failed_attempts>=4 THEN clock_timestamp()+interval '15 minutes' ELSE NULL END WHERE user_id=who.actor;
  INSERT INTO platform_admin.audit(actor_id,action) VALUES(who.actor,'mfa.denied');RETURN jsonb_build_object('verified',false);
 END IF;
 RAISE EXCEPTION 'Invalid MFA request' USING ERRCODE='22023';
END $$;
CREATE FUNCTION platform_admin.allowed(p_role text,p_module text,p_write boolean) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_role='Super Admin' THEN true
 WHEN p_role='Read-only Auditor' THEN NOT p_write AND p_module IN('overview','subscriptions','plans','payments','ocr','ors','reports','team','audit','settings')
 WHEN p_role='Billing Admin' THEN p_module IN('overview','subscriptions','plans','payments','reports')
 WHEN p_role='Support Agent' THEN p_module IN('overview','users','companies','support','ocr','notifications') AND (NOT p_write OR p_module IN('support','notifications'))
 WHEN p_role='Sales Agent' THEN p_module IN('overview','leads') ELSE false END;
$$;
CREATE FUNCTION platform_admin.billing_action(p_actor uuid,p_action text,p_id uuid,p_version bigint,p_body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c platform_admin.contracts;plan_row platform_admin.plans;inv platform_admin.billing_invoices;new_id uuid;balance numeric;owner_id uuid;start_at timestamptz;end_at timestamptz;BEGIN
 IF p_action='request_state' THEN
  UPDATE platform_admin.billing_requests SET state=p_body->>'state',version=version+1 WHERE id=p_id AND version=p_version AND p_body->>'state' IN('acknowledged','closed') RETURNING id,account_id INTO new_id,c.account_id;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Request version conflict' USING ERRCODE='23505';END IF;
  INSERT INTO platform_admin.billing_events(account_id,actor_id,action,target_id) VALUES(c.account_id,p_actor,'request.'||(p_body->>'state'),new_id);
  RETURN jsonb_build_object('id',new_id,'state',p_body->>'state');
 END IF;
 IF p_action='assign' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,7043));
  SELECT a.owner_id INTO owner_id FROM saas.billing_accounts a WHERE a.id=p_id AND a.status='active' FOR SHARE;
  IF owner_id IS NULL OR p_version<>0 OR EXISTS(SELECT 1 FROM platform_admin.contracts WHERE account_id=p_id) THEN RAISE EXCEPTION 'Account unavailable or contract already exists' USING ERRCODE='23505';END IF;
  SELECT * INTO plan_row FROM platform_admin.plans WHERE id=(p_body->>'plan_id')::uuid AND NOT archived FOR SHARE;
  IF plan_row.id IS NULL THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023';END IF;
  start_at=clock_timestamp();end_at=start_at+CASE WHEN plan_row.interval='year' THEN interval '1 year' ELSE interval '1 month' END;
  INSERT INTO platform_admin.contracts(account_id,plan_id,terms,status,period_start,period_end,grace_until) VALUES(p_id,plan_row.id,to_jsonb(plan_row),CASE WHEN plan_row.price=0 THEN 'active' ELSE 'past_due' END,start_at,end_at,start_at+interval '3 days') RETURNING * INTO c;
 ELSIF p_action='receipt' THEN
  SELECT * INTO inv FROM platform_admin.billing_invoices WHERE id=p_id;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Billing invoice unavailable' USING ERRCODE='22023';END IF;
  SELECT * INTO c FROM platform_admin.contracts WHERE id=inv.contract_id FOR UPDATE;
  IF c.version<>p_version THEN RAISE EXCEPTION 'Contract changed' USING ERRCODE='23505';END IF;
  SELECT inv.amount-coalesce(sum(amount),0) INTO balance FROM platform_admin.receipts WHERE invoice_id=inv.id;
  IF p_body->>'currency' IS DISTINCT FROM inv.currency OR (p_body->>'amount')::numeric>balance OR (p_body->>'amount')::numeric<>round((p_body->>'amount')::numeric,2) OR (p_body->>'received_at')::timestamptz>clock_timestamp() THEN RAISE EXCEPTION 'Payment exceeds balance, is future-dated or has a currency mismatch' USING ERRCODE='22023';END IF;
  INSERT INTO platform_admin.receipts(invoice_id,amount,currency,external_reference,received_at,actor_id) VALUES(inv.id,(p_body->>'amount')::numeric,inv.currency,trim(p_body->>'external_reference'),(p_body->>'received_at')::timestamptz,p_actor) RETURNING id INTO new_id;
  UPDATE platform_admin.contracts SET status=CASE WHEN balance=(p_body->>'amount')::numeric AND inv.period_end=period_end AND inv.period_end>clock_timestamp() AND status<>'cancelled' THEN 'active' ELSE status END,version=version+1 WHERE id=c.id RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM platform_admin.contracts WHERE id=p_id FOR UPDATE;
  IF c.id IS NULL OR c.version<>p_version THEN RAISE EXCEPTION 'Contract version conflict' USING ERRCODE='23505';END IF;
  CASE p_action
  WHEN 'schedule' THEN
   SELECT * INTO plan_row FROM platform_admin.plans WHERE id=(p_body->>'plan_id')::uuid AND NOT archived FOR SHARE;
   IF plan_row.id IS NULL OR c.status='cancelled' THEN RAISE EXCEPTION 'Plan or contract unavailable' USING ERRCODE='22023';END IF;
   UPDATE platform_admin.contracts SET scheduled_plan_id=plan_row.id,version=version+1 WHERE id=c.id RETURNING * INTO c;
  WHEN 'cancel' THEN UPDATE platform_admin.contracts SET cancel_at_end=(p_body->>'at_period_end')::boolean,status=CASE WHEN (p_body->>'at_period_end')::boolean THEN status ELSE 'cancelled' END,version=version+1 WHERE id=c.id RETURNING * INTO c;
  WHEN 'reconcile' THEN
   IF c.status='cancelled' THEN RAISE EXCEPTION 'Cancelled contract cannot renew' USING ERRCODE='22023';END IF;
   IF c.period_end<=clock_timestamp() THEN
    IF c.cancel_at_end THEN UPDATE platform_admin.contracts SET status='cancelled',version=version+1 WHERE id=c.id RETURNING * INTO c;
    ELSE
     SELECT * INTO plan_row FROM platform_admin.plans WHERE id=coalesce(c.scheduled_plan_id,c.plan_id) AND NOT archived FOR SHARE;
     IF plan_row.id IS NULL THEN RAISE EXCEPTION 'Renewal plan archived; review another plan' USING ERRCODE='22023';END IF;
     start_at=c.period_end;end_at=start_at+CASE WHEN plan_row.interval='year' THEN interval '1 year' ELSE interval '1 month' END;
     IF end_at<=clock_timestamp() THEN RAISE EXCEPTION 'Stale subscription requires manual period review; historical periods are not silently billed' USING ERRCODE='22023';END IF;
     UPDATE platform_admin.contracts SET plan_id=plan_row.id,terms=to_jsonb(plan_row),scheduled_plan_id=NULL,status=CASE WHEN plan_row.price=0 THEN 'active' ELSE 'past_due' END,period_start=start_at,period_end=end_at,grace_until=start_at+interval '3 days',version=version+1 WHERE id=c.id RETURNING * INTO c;
    END IF;
   ELSIF c.status='past_due' AND c.grace_until<=clock_timestamp() THEN UPDATE platform_admin.contracts SET status='expired',version=version+1 WHERE id=c.id RETURNING * INTO c;
   ELSE
    INSERT INTO platform_admin.billing_reminders(contract_id,period_end,kind) VALUES(c.id,c.period_end,CASE WHEN c.status='past_due' THEN 'past_due' ELSE 'renewal' END) ON CONFLICT DO NOTHING RETURNING id INTO new_id;
    IF new_id IS NOT NULL THEN
     SELECT a.owner_id INTO owner_id FROM saas.billing_accounts a WHERE a.id=c.account_id;
     INSERT INTO platform_admin.notifications(user_id,title,body,created_by) VALUES(owner_id,'Subscription reminder',CASE WHEN c.status='past_due' THEN 'A subscription invoice is awaiting payment review. No money has been collected by this notification.' ELSE 'Your current subscription period ends on '||c.period_end::date::text||'.' END,p_actor);
    END IF;
   END IF;
  ELSE RAISE EXCEPTION 'Unsupported billing action' USING ERRCODE='22023';END CASE;
 END IF;
 IF p_action IN('assign','reconcile') AND c.status<>'cancelled' THEN
  INSERT INTO platform_admin.billing_invoices(contract_id,account_id,reference,period_start,period_end,currency,amount) VALUES(c.id,c.account_id,'VTV-'||upper(replace(gen_random_uuid()::text,'-','')),c.period_start,c.period_end,c.terms->>'currency',(c.terms->>'price')::numeric) ON CONFLICT(contract_id,period_start) DO NOTHING RETURNING id INTO new_id;
 END IF;
 -- Quotas are consumed by the existing invoice/team/company SQL functions.
 INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference,platform_plan_id)
 VALUES(c.account_id,'Growth','active',(c.terms->>'invoice_limit')::int,(c.terms->>'company_limit')::int,(c.terms->>'seat_limit')::int,NULL,(c.terms->>'ors_enabled')::boolean,now(),'reviewed-platform-contract:'||c.id,c.plan_id)
 ON CONFLICT(account_id) DO UPDATE SET plan=excluded.plan,status='active',invoices_per_month=excluded.invoices_per_month,company_limit=excluded.company_limit,seat_limit=excluded.seat_limit,history_days=NULL,ors_enabled=excluded.ors_enabled,verified_at=excluded.verified_at,source_reference=excluded.source_reference,platform_plan_id=excluded.platform_plan_id,trial_status=CASE WHEN saas.subscription_entitlements.trial_status IS NULL THEN NULL ELSE 'converted' END,version=saas.subscription_entitlements.version+1;
 INSERT INTO platform_admin.billing_events(account_id,actor_id,action,target_id) VALUES(c.account_id,p_actor,p_action,coalesce(new_id,c.id));
 RETURN jsonb_build_object('id',c.id,'version',c.version,'status',c.status,'invoiceId',CASE WHEN p_action='receipt' THEN inv.id ELSE new_id END,'paymentCollectedByApplication',false);
END $$;
-- Read-only, explicitly whitelisted projections. No document paths, originals,
-- invoice bodies, credentials, provider payloads or auth audit metadata.
CREATE FUNCTION platform_admin.revenue() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH accrued AS (
  SELECT currency,round(sum(amount*extract(epoch FROM (least(greatest(statement_timestamp(),period_start),period_end)-period_start))/extract(epoch FROM (period_end-period_start))),2) AS recognized FROM platform_admin.billing_invoices GROUP BY currency
 ),collected AS (SELECT currency,sum(amount) AS collected FROM platform_admin.receipts GROUP BY currency),
 projected AS (SELECT terms->>'currency' AS currency,round(sum((terms->>'price')::numeric/CASE WHEN terms->>'interval'='year' THEN 12 ELSE 1 END),2) AS projected_monthly FROM platform_admin.contracts WHERE status='active' AND NOT cancel_at_end AND period_end>statement_timestamp() GROUP BY 1),
 currencies AS (SELECT currency FROM accrued UNION SELECT currency FROM collected UNION SELECT currency FROM projected)
 SELECT jsonb_build_object('available',true,'basis','Service-period accrual, recorded receipts, and active-contract monthly run rate; excludes tax; not statutory accounts','byCurrency',coalesce((SELECT jsonb_agg(t ORDER BY t.currency) FROM (SELECT c.currency,coalesce(a.recognized,0) AS recognized,coalesce(r.collected,0) AS collected,coalesce(p.projected_monthly,0) AS projected_monthly FROM currencies c LEFT JOIN accrued a USING(currency) LEFT JOIN collected r USING(currency) LEFT JOIN projected p USING(currency)) t),'[]'));
$$;
CREATE FUNCTION platform_admin.read(p_hash text,p_module text,p_query text DEFAULT '',p_after uuid DEFAULT NULL,p_state text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;rows jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,p_module,false) THEN RAISE EXCEPTION 'Platform scope denied' USING ERRCODE='42501';END IF;
 IF p_query IS NULL OR length(p_query)>200 OR p_state IS NULL OR length(p_state)>80 THEN RAISE EXCEPTION 'Invalid directory filters' USING ERRCODE='22023'; END IF;
 CASE p_module
 WHEN 'users' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT u.id,u.full_name,u.email,u.status,u.created_at, u.email_verified_at IS NOT NULL AS verified,(SELECT count(*) FROM web_auth.company_memberships m WHERE m.user_id=u.id AND m.status='active') AS companies FROM web_auth.users u WHERE (p_after IS NULL OR u.id>p_after) AND (p_query='' OR u.email ILIKE '%'||p_query||'%' OR u.full_name ILIKE '%'||p_query||'%') AND (p_state='' OR u.status=p_state) ORDER BY u.id LIMIT 51) t;
 WHEN 'companies' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT c.id,c.name,c.owner_id,c.created_at,p.status,p.currency,p.account_id,p.version,(SELECT count(*) FROM web_auth.company_memberships m WHERE m.company_id=c.id AND m.status='active') AS members FROM web_auth.companies c LEFT JOIN saas.company_profiles p ON p.company_id=c.id WHERE (p_after IS NULL OR c.id>p_after) AND (p_query='' OR c.name ILIKE '%'||p_query||'%') AND (p_state='' OR p.status=p_state) ORDER BY c.id LIMIT 51) t;
 WHEN 'subscriptions' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT e.id,e.account_id,coalesce(c.terms->>'name',e.plan) AS plan,CASE WHEN c.id IS NOT NULL THEN CASE WHEN c.status='active' AND c.period_end<=now() OR c.status='past_due' AND c.grace_until<=now() THEN 'expired' ELSE c.status END ELSE e.status END AS status,e.invoices_per_month,e.company_limit,e.seat_limit,e.ors_enabled,e.trial_status,e.trial_expires_at,coalesce(c.version,0) AS version,c.id AS contract_id,c.period_end,c.grace_until,c.cancel_at_end,c.scheduled_plan_id FROM saas.subscription_entitlements e LEFT JOIN platform_admin.contracts c ON c.account_id=e.account_id WHERE (p_after IS NULL OR e.id>p_after) AND (p_query='' OR e.account_id::text ILIKE '%'||p_query||'%' OR coalesce(c.terms->>'name',e.plan) ILIKE '%'||p_query||'%') AND (p_state='' OR CASE WHEN c.id IS NOT NULL THEN CASE WHEN c.status='active' AND c.period_end<=now() OR c.status='past_due' AND c.grace_until<=now() THEN 'expired' ELSE c.status END ELSE e.status END=p_state) ORDER BY e.id LIMIT 51) t;
 WHEN 'plans' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT * FROM platform_admin.plans WHERE (p_after IS NULL OR id>p_after) AND (p_query='' OR name ILIKE '%'||p_query||'%') ORDER BY id LIMIT 51) t;
 WHEN 'leads' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT e.id,e.payload->>'fullName' AS full_name,e.payload->>'businessName' AS company,e.payload->>'email' AS email,e.payload->>'phone' AS phone,e.payload->>'category' AS service,'Website contact form' AS source,e.created_at,coalesce(d.stage,e.status) AS stage,d.assignee_id,coalesce(d.notes,'') AS notes,d.remind_at,d.company_id,coalesce(d.version,0) AS version FROM contact_intake.enquiries e LEFT JOIN platform_admin.lead_details d ON d.lead_id=e.id WHERE (p_after IS NULL OR e.id>p_after) AND (p_query='' OR e.payload->>'email' ILIKE '%'||p_query||'%' OR e.payload->>'businessName' ILIKE '%'||p_query||'%') AND (p_state='' OR coalesce(d.stage,e.status)=p_state) ORDER BY e.id LIMIT 51) t;
 WHEN 'support' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT t.id,t.company_id,t.subject,t.category,t.state,t.version,t.created_at,t.updated_at,coalesce(d.priority,'normal') AS priority,d.assignee_id,coalesce(d.escalated,false) AS escalated,coalesce(d.version,0) AS assignment_version FROM support_desk.tickets t LEFT JOIN platform_admin.ticket_details d ON d.ticket_id=t.id WHERE (p_after IS NULL OR t.id>p_after) AND (p_query='' OR t.subject ILIKE '%'||p_query||'%') AND (p_state='' OR t.state=p_state) ORDER BY t.id LIMIT 51) t;
 WHEN 'ocr' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT p.company_id AS id,c.name,count(d.id) AS documents,count(d.id) FILTER(WHERE d.state='rejected') AS rejected,coalesce(sum(d.byte_size),0)::text AS bytes,(SELECT count(*) FROM saas.document_jobs j WHERE j.company_id=p.company_id AND j.state='failed') AS failed_jobs FROM saas.company_profiles p JOIN web_auth.companies c ON c.id=p.company_id LEFT JOIN saas.documents d ON d.company_id=p.company_id WHERE (p_after IS NULL OR p.company_id>p_after) AND (p_query='' OR c.name ILIKE '%'||p_query||'%') GROUP BY p.company_id,c.name ORDER BY p.company_id LIMIT 51) t;
 WHEN 'ors' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT c.id,c.name,(SELECT count(*) FROM operations.purchase_orders o WHERE o.company_id=c.id) AS purchase_orders,(SELECT count(*) FROM operations.shopping_dispatches d WHERE d.company_id=c.id) AS whatsapp_drafts,(SELECT count(*) FROM operations.shopping_dispatches d WHERE d.company_id=c.id AND d.state='pending_dispatch') AS pending_dispatches FROM web_auth.companies c WHERE (p_after IS NULL OR c.id>p_after) AND (p_query='' OR c.name ILIKE '%'||p_query||'%') ORDER BY c.id LIMIT 51) t;
 WHEN 'team' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT g.user_id AS id,u.full_name,u.email,g.role,g.active,g.version,coalesce(f.verified,false) AS mfa_enrolled FROM platform_admin.grants g JOIN web_auth.users u ON u.id=g.user_id LEFT JOIN platform_admin.factors f ON f.user_id=g.user_id WHERE (p_after IS NULL OR g.user_id>p_after) ORDER BY g.user_id LIMIT 51) t;
 WHEN 'audit' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT id,actor_id,action,target_id,reason,created_at FROM platform_admin.audit WHERE (p_after IS NULL OR id>p_after) AND (p_query='' OR action ILIKE '%'||p_query||'%') ORDER BY id LIMIT 51) t;
 WHEN 'notifications' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT id,user_id,title,body,created_by,created_at,read_at FROM platform_admin.notifications WHERE (p_after IS NULL OR id>p_after) ORDER BY id LIMIT 51) t;
 WHEN 'settings' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT key AS id,value,version FROM platform_admin.settings ORDER BY key) t;
 WHEN 'payments' THEN SELECT coalesce(jsonb_agg(t),'[]') INTO rows FROM (SELECT i.id,i.reference,i.account_id,i.contract_id,i.currency,i.amount,i.period_start,i.period_end,coalesce((SELECT sum(r.amount) FROM platform_admin.receipts r WHERE r.invoice_id=i.id),0) AS collected,i.amount-coalesce((SELECT sum(r.amount) FROM platform_admin.receipts r WHERE r.invoice_id=i.id),0) AS balance,c.version FROM platform_admin.billing_invoices i JOIN platform_admin.contracts c ON c.id=i.contract_id WHERE (p_after IS NULL OR i.id>p_after) AND (p_query='' OR i.reference ILIKE '%'||p_query||'%') ORDER BY i.id LIMIT 51) t;
 WHEN 'overview','reports' THEN
  rows=jsonb_build_object('users',(SELECT count(*) FROM web_auth.users),'companies',(SELECT count(*) FROM web_auth.companies),'openTickets',(SELECT count(*) FROM support_desk.tickets WHERE state<>'closed'),'leads',(SELECT count(*) FROM contact_intake.enquiries),'activeSubscriptions',(SELECT count(*) FROM saas.subscription_entitlements e LEFT JOIN platform_admin.contracts c ON c.account_id=e.account_id WHERE e.status='active' AND (c.id IS NULL AND (e.trial_status IS NULL OR e.trial_status='converted' OR e.trial_status='active' AND e.trial_expires_at>now()) OR c.status='active' AND c.period_end>now())),'failedDocumentJobs',(SELECT count(*) FROM saas.document_jobs WHERE state='failed'),'revenue',platform_admin.revenue(),'subscriptionsByStatus',(SELECT coalesce(jsonb_agg(s),'[]') FROM (SELECT CASE WHEN c.id IS NOT NULL THEN CASE WHEN c.status='active' AND c.period_end<=now() OR c.status='past_due' AND c.grace_until<=now() THEN 'expired' ELSE c.status END WHEN e.trial_status='active' AND e.trial_expires_at>now() THEN 'trial' WHEN e.trial_status IN('active','expired') THEN 'expired' ELSE e.status END AS status,count(*) AS count FROM saas.subscription_entitlements e LEFT JOIN platform_admin.contracts c ON c.account_id=e.account_id GROUP BY 1 ORDER BY 1) s),'leadsByStatus',(SELECT coalesce(jsonb_agg(s),'[]') FROM (SELECT coalesce(d.stage,e.status) AS status,count(*) AS count FROM contact_intake.enquiries e LEFT JOIN platform_admin.lead_details d ON d.lead_id=e.id GROUP BY 1 ORDER BY 1) s));
 ELSE RAISE EXCEPTION 'Unknown platform module' USING ERRCODE='22023';
 END CASE;
 IF p_module='overview' THEN
  IF who.role_name='Sales Agent' THEN rows=jsonb_build_object('leads',rows->'leads','leadsByStatus',rows->'leadsByStatus');
  ELSIF who.role_name='Support Agent' THEN rows=rows-ARRAY['revenue','leads','leadsByStatus','activeSubscriptions','subscriptionsByStatus'];
  ELSIF who.role_name='Billing Admin' THEN rows=rows-ARRAY['leads','leadsByStatus','openTickets','failedDocumentJobs'];END IF;
 END IF;
 INSERT INTO platform_admin.audit(actor_id,action,details) VALUES(who.actor,'read.'||p_module,jsonb_build_object('filtered',p_query<>'' OR p_state<>''));
 RETURN jsonb_build_object('role',who.role_name,'module',p_module,'records',rows);
END $$;
RESET ROLE;
-- Auth-owner bridge: narrow state change only, no credential access or arbitrary SQL.
SET LOCAL ROLE vtv_web_owner;
CREATE FUNCTION web_auth.platform_user_state(p_user uuid,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_status NOT IN('active','suspended') OR p_status IS NULL THEN RAISE EXCEPTION 'Invalid identity state' USING ERRCODE='22023';END IF;
 UPDATE web_auth.users SET status=p_status,updated_at=now() WHERE id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Identity unavailable' USING ERRCODE='22023';END IF;
 IF p_status='suspended' THEN UPDATE web_auth.sessions SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=p_user;END IF;
END $$;
REVOKE ALL ON FUNCTION web_auth.platform_user_state(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web_auth.platform_user_state(uuid,text) TO vtv_saas_owner;
RESET ROLE;
SET LOCAL ROLE vtv_saas_owner;
CREATE FUNCTION platform_admin.command(p_hash text,p_module text,p_action text,p_id uuid,p_version bigint,p_body jsonb,p_key text,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;existing platform_admin.commands;req jsonb;result jsonb;new_id uuid;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,p_module,true) THEN RAISE EXCEPTION 'Platform write denied' USING ERRCODE='42501';END IF;
 IF p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 500 OR p_body IS NULL OR jsonb_typeof(p_body)<>'object' OR octet_length(p_body::text)>15000 OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid platform command' USING ERRCODE='22023';END IF;
 req=jsonb_build_object('module',p_module,'action',p_action,'id',p_id,'version',p_version,'body',p_body,'reason',p_reason);
 INSERT INTO platform_admin.commands(actor_id,key,request) VALUES(who.actor,p_key,req) ON CONFLICT DO NOTHING;
 SELECT * INTO existing FROM platform_admin.commands WHERE actor_id=who.actor AND key=p_key FOR UPDATE;
 IF existing.request IS DISTINCT FROM req THEN RAISE EXCEPTION 'Request reference conflict' USING ERRCODE='23505';END IF;
 IF existing.response IS NOT NULL THEN RETURN existing.response;END IF;
 CASE
 WHEN p_module IN('subscriptions','payments') AND p_action IN('assign','schedule','cancel','reconcile','receipt','request_state') THEN
  IF (p_module='payments') IS DISTINCT FROM (p_action='receipt') THEN RAISE EXCEPTION 'Invalid billing scope' USING ERRCODE='22023';END IF;
  result=platform_admin.billing_action(who.actor,p_action,p_id,p_version,p_body);new_id=(result->>'id')::uuid;
 WHEN p_module='team' AND p_action='grant' THEN
  IF p_id=who.actor OR NOT EXISTS(SELECT 1 FROM web_auth.users WHERE id=p_id AND status='active' AND email_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Select another active verified identity' USING ERRCODE='22023';END IF;
  INSERT INTO platform_admin.grants(user_id,role,active) SELECT p_id,p_body->>'role',(p_body->>'active')::boolean WHERE p_version=0 ON CONFLICT DO NOTHING;
  IF FOUND THEN new_id=p_id;ELSE UPDATE platform_admin.grants SET role=p_body->>'role',active=(p_body->>'active')::boolean,version=version+1 WHERE user_id=p_id AND version=p_version RETURNING user_id INTO new_id;END IF;
  UPDATE platform_admin.mfa_sessions SET expires_at=now() WHERE user_id=p_id;
 WHEN p_module='users' AND p_action='state' THEN
  IF p_id=who.actor OR EXISTS(SELECT 1 FROM platform_admin.grants WHERE user_id=p_id AND active) THEN RAISE EXCEPTION 'Use the separately reviewed admin revocation process' USING ERRCODE='22023'; END IF;
  PERFORM web_auth.platform_user_state(p_id,p_body->>'status');new_id=p_id;
 WHEN p_module='companies' AND p_action='state' THEN
  UPDATE saas.company_profiles SET status=p_body->>'status',version=version+1 WHERE company_id=p_id AND version=p_version AND p_body->>'status' IN('active','suspended') RETURNING company_id INTO new_id;
 WHEN p_module='plans' AND p_action='create' THEN
  INSERT INTO platform_admin.plans(name,currency,price,interval,invoice_limit,ocr_limit,company_limit,seat_limit,ors_enabled) VALUES(trim(p_body->>'name'),p_body->>'currency',(p_body->>'price')::numeric,p_body->>'interval',(p_body->>'invoice_limit')::int,coalesce((p_body->>'ocr_limit')::int,(p_body->>'invoice_limit')::int),(p_body->>'company_limit')::int,(p_body->>'seat_limit')::int,(p_body->>'ors_enabled')::boolean) RETURNING id INTO new_id;
 WHEN p_module='plans' AND p_action='archive' THEN UPDATE platform_admin.plans SET archived=true,version=version+1 WHERE id=p_id AND version=p_version RETURNING id INTO new_id;
 WHEN p_module='plans' AND p_action='update' THEN UPDATE platform_admin.plans SET name=trim(p_body->>'name'),currency=p_body->>'currency',price=(p_body->>'price')::numeric,interval=p_body->>'interval',invoice_limit=(p_body->>'invoice_limit')::int,ocr_limit=coalesce((p_body->>'ocr_limit')::int,(p_body->>'invoice_limit')::int),company_limit=(p_body->>'company_limit')::int,seat_limit=(p_body->>'seat_limit')::int,ors_enabled=(p_body->>'ors_enabled')::boolean,version=version+1 WHERE id=p_id AND version=p_version AND NOT archived RETURNING id INTO new_id;
 WHEN p_module='leads' AND p_action='update' THEN
  IF p_body->>'assignee_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_admin.grants WHERE user_id=(p_body->>'assignee_id')::uuid AND active AND role IN('Super Admin','Sales Agent')) THEN RAISE EXCEPTION 'Sales assignee unavailable' USING ERRCODE='22023';END IF;
  INSERT INTO platform_admin.lead_details(lead_id,stage,assignee_id,notes,remind_at,company_id) SELECT p_id,p_body->>'stage',(p_body->>'assignee_id')::uuid,p_body->>'notes',(p_body->>'remind_at')::timestamptz,(p_body->>'company_id')::uuid WHERE p_version=0 ON CONFLICT DO NOTHING;
  IF FOUND THEN new_id=p_id;ELSE UPDATE platform_admin.lead_details SET stage=p_body->>'stage',assignee_id=(p_body->>'assignee_id')::uuid,notes=p_body->>'notes',remind_at=(p_body->>'remind_at')::timestamptz,company_id=(p_body->>'company_id')::uuid,version=version+1 WHERE lead_id=p_id AND version=p_version RETURNING lead_id INTO new_id; END IF;
 WHEN p_module='support' AND p_action='assign' THEN
  IF p_body->>'assignee_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_admin.grants WHERE user_id=(p_body->>'assignee_id')::uuid AND active AND role IN('Super Admin','Support Agent')) THEN RAISE EXCEPTION 'Support assignee unavailable' USING ERRCODE='22023';END IF;
  INSERT INTO platform_admin.ticket_details(ticket_id,priority,assignee_id,escalated) SELECT p_id,p_body->>'priority',(p_body->>'assignee_id')::uuid,(p_body->>'escalated')::boolean WHERE p_version=0 ON CONFLICT DO NOTHING;
  IF FOUND THEN new_id=p_id; ELSE UPDATE platform_admin.ticket_details SET priority=p_body->>'priority',assignee_id=(p_body->>'assignee_id')::uuid,escalated=(p_body->>'escalated')::boolean,version=version+1 WHERE ticket_id=p_id AND version=p_version RETURNING ticket_id INTO new_id;END IF;
 WHEN p_module='support' AND p_action='note' THEN INSERT INTO platform_admin.ticket_notes(ticket_id,actor_id,body) VALUES(p_id,who.actor,trim(p_body->>'body')) RETURNING id INTO new_id;
 WHEN p_module='support' AND p_action='reply' THEN
  UPDATE support_desk.tickets SET updated_at=now(),version=version+1 WHERE id=p_id AND version=p_version AND state<>'closed' RETURNING id INTO new_id;
  IF new_id IS NOT NULL THEN INSERT INTO support_desk.messages(ticket_id,actor_id,body) VALUES(p_id,who.actor,trim(p_body->>'body'));END IF;
 WHEN p_module='support' AND p_action='state' THEN UPDATE support_desk.tickets SET state=p_body->>'state',updated_at=now(),version=version+1 WHERE id=p_id AND version=p_version AND p_body->>'state' IN('open','pending','closed') RETURNING id INTO new_id;
 WHEN p_module='notifications' AND p_action='create' THEN INSERT INTO platform_admin.notifications(user_id,title,body,created_by) VALUES((p_body->>'user_id')::uuid,trim(p_body->>'title'),trim(p_body->>'body'),who.actor) RETURNING id INTO new_id;
 WHEN p_module='settings' AND p_action='save' THEN
  INSERT INTO platform_admin.settings(key,value) SELECT p_body->>'key',p_body->>'value' WHERE p_version=0 ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN UPDATE platform_admin.settings SET value=p_body->>'value',version=version+1 WHERE key=p_body->>'key' AND version=p_version;IF NOT FOUND THEN RAISE EXCEPTION 'Settings version conflict' USING ERRCODE='23505';END IF;END IF;
  result=jsonb_build_object('key',p_body->>'key');
 ELSE RAISE EXCEPTION 'Unsupported platform command' USING ERRCODE='22023';
 END CASE;
 IF new_id IS NULL AND result IS NULL THEN RAISE EXCEPTION 'Record changed or unavailable' USING ERRCODE='23505';END IF;
 result=coalesce(result,jsonb_build_object('id',new_id));
 INSERT INTO platform_admin.audit(actor_id,action,target_id,reason,details) VALUES(who.actor,p_module||'.'||p_action,coalesce(p_id,new_id),p_reason,jsonb_build_object('requestKey',p_key)||CASE WHEN p_module='leads' THEN jsonb_build_object('stage',p_body->>'stage','assignee_id',p_body->>'assignee_id','remind_at',p_body->>'remind_at','company_id',p_body->>'company_id') ELSE '{}'::jsonb END);
 UPDATE platform_admin.commands SET response=result WHERE actor_id=who.actor AND key=p_key;RETURN result;
END $$;
CREATE FUNCTION platform_admin.ticket(p_hash text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,'support',false) THEN RAISE EXCEPTION 'Support scope denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('ticket',to_jsonb(t),'messages',(SELECT coalesce(jsonb_agg(m),'[]') FROM (SELECT id,actor_id,body,created_at FROM support_desk.messages WHERE ticket_id=p_id ORDER BY created_at DESC,id DESC LIMIT 100) m),'internalNotes',(SELECT coalesce(jsonb_agg(n),'[]') FROM (SELECT id,actor_id,body,created_at FROM platform_admin.ticket_notes WHERE ticket_id=p_id ORDER BY created_at DESC,id DESC LIMIT 100) n)) INTO result FROM support_desk.tickets t WHERE t.id=p_id;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(who.actor,'read.ticket',p_id);RETURN result;
END $$;
-- Remove the legacy company-wide administrator shortcut. Customer support
-- requests always need membership; explicit admin scope needs live MFA + RBAC.
CREATE OR REPLACE FUNCTION support_desk.authorize(p_hash text,p_company uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid;who record;BEGIN
 a=saas.team_identity(p_hash);
 IF p_company IS NOT NULL THEN
  PERFORM 1 FROM web_auth.company_memberships WHERE user_id=a AND company_id=p_company AND status='active' FOR SHARE;
  IF FOUND THEN RETURN a;END IF;
 ELSE
  SELECT * INTO who FROM platform_admin.identity(p_hash);
  IF platform_admin.allowed(who.role_name,'support',true) THEN RETURN a;END IF;
 END IF;
 RAISE EXCEPTION 'Support scope denied' USING ERRCODE='42501';
END $$;
CREATE FUNCTION platform_admin.profile(p_hash text,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF p_kind NOT IN('users','companies') OR NOT platform_admin.allowed(who.role_name,p_kind,false) THEN RAISE EXCEPTION 'Profile scope denied' USING ERRCODE='42501';END IF;
 IF p_kind='users' THEN
  SELECT jsonb_build_object('identity',jsonb_build_object('id',u.id,'full_name',u.full_name,'email',u.email,'status',u.status,'created_at',u.created_at,'verified',u.email_verified_at IS NOT NULL),
  'memberships',(SELECT coalesce(jsonb_agg(m),'[]') FROM (SELECT c.id,c.name,m.role,m.status FROM web_auth.company_memberships m JOIN web_auth.companies c ON c.id=m.company_id WHERE m.user_id=u.id ORDER BY c.id LIMIT 100) m),
  'subscriptions',(SELECT coalesce(jsonb_agg(e),'[]') FROM (SELECT a.id AS account_id,e.plan,e.status,e.invoices_per_month,e.company_limit,e.seat_limit,e.ors_enabled,e.trial_status,e.trial_expires_at FROM saas.billing_accounts a LEFT JOIN saas.subscription_entitlements e ON e.account_id=a.id WHERE a.owner_id=u.id ORDER BY a.id LIMIT 100) e),
  'support_tickets',(SELECT count(*) FROM support_desk.tickets WHERE opened_by=u.id)) INTO result FROM web_auth.users u WHERE u.id=p_id;
 ELSE
  SELECT jsonb_build_object('identity',jsonb_build_object('id',c.id,'name',c.name,'owner_id',c.owner_id,'created_at',c.created_at,'status',p.status,'currency',p.currency),
  'memberships',(SELECT coalesce(jsonb_agg(m),'[]') FROM (SELECT u.id,u.full_name,m.role,m.status FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id WHERE m.company_id=c.id ORDER BY u.id LIMIT 100) m),
  'subscriptions',(SELECT coalesce(jsonb_agg(e),'[]') FROM (SELECT account_id,plan,status,invoices_per_month,company_limit,seat_limit,ors_enabled,trial_status,trial_expires_at FROM saas.subscription_entitlements WHERE account_id=p.account_id) e),
  'usage',jsonb_build_object('documents',(SELECT count(*) FROM saas.documents WHERE company_id=c.id),'bytes',(SELECT coalesce(sum(byte_size),0)::text FROM saas.documents WHERE company_id=c.id),'invoices_this_month',(SELECT count(*) FROM business.invoice_usage WHERE company_id=c.id AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),'ors_orders',(SELECT count(*) FROM operations.purchase_orders WHERE company_id=c.id)),
  'support_tickets',(SELECT count(*) FROM support_desk.tickets WHERE company_id=c.id)) INTO result FROM web_auth.companies c LEFT JOIN saas.company_profiles p ON p.company_id=c.id WHERE c.id=p_id;
 END IF;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(who.actor,'profile.'||p_kind,p_id);RETURN result;
END $$;
CREATE FUNCTION platform_admin.billing_detail(p_hash text,p_account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,'subscriptions',false) THEN RAISE EXCEPTION 'Billing scope denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('account',jsonb_build_object('id',a.id,'status',a.status),'contract',(SELECT to_jsonb(c) FROM platform_admin.contracts c WHERE c.account_id=a.id),
 'requests',(SELECT coalesce(jsonb_agg(r),'[]') FROM (SELECT id,kind,plan_id,message,state,version,created_at FROM platform_admin.billing_requests WHERE account_id=a.id ORDER BY created_at DESC,id DESC LIMIT 100) r),
 'receipts',(SELECT coalesce(jsonb_agg(r),'[]') FROM (SELECT r.id,r.invoice_id,r.amount,r.currency,r.external_reference,r.received_at FROM platform_admin.receipts r JOIN platform_admin.billing_invoices i ON i.id=r.invoice_id WHERE i.account_id=a.id ORDER BY r.received_at DESC,r.id DESC LIMIT 100) r),
 'history',(SELECT coalesce(jsonb_agg(e),'[]') FROM (SELECT action,target_id,created_at FROM platform_admin.billing_events WHERE account_id=a.id ORDER BY created_at DESC,id DESC LIMIT 100) e)) INTO result FROM saas.billing_accounts a WHERE a.id=p_account;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(who.actor,'read.billing_detail',p_account);RETURN result;
END $$;
CREATE FUNCTION platform_admin.lead_timeline(p_hash text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE who record;result jsonb;BEGIN
 SELECT * INTO who FROM platform_admin.identity(p_hash);
 IF NOT platform_admin.allowed(who.role_name,'leads',false) THEN RAISE EXCEPTION 'Sales scope denied' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',e.id,'source','Website contact form','message',e.payload->>'message','submitted_at',e.created_at,'events',(SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT action,reason,details-'requestKey' AS changes,created_at FROM platform_admin.audit WHERE target_id=e.id AND action='leads.update' ORDER BY created_at DESC,id DESC LIMIT 100) t)) INTO result FROM contact_intake.enquiries e WHERE id=p_id;
 INSERT INTO platform_admin.audit(actor_id,action,target_id) VALUES(who.actor,'read.lead_timeline',p_id);RETURN result;
END $$;
CREATE FUNCTION platform_admin.customer(p_hash text,p_account uuid,p_action text,p_body jsonb DEFAULT '{}',p_key text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid;existing platform_admin.commands;req jsonb;result jsonb;new_id uuid;BEGIN
 a=saas.team_identity(p_hash);
 IF p_action='notifications' THEN RETURN (SELECT coalesce(jsonb_agg(n),'[]') FROM (SELECT id,title,body,created_at,read_at FROM platform_admin.notifications WHERE user_id=a ORDER BY created_at DESC,id DESC LIMIT 100) n);END IF;
 IF p_action='mark_read' THEN
  UPDATE platform_admin.notifications SET read_at=coalesce(read_at,now()) WHERE id=(p_body->>'id')::uuid AND user_id=a RETURNING id INTO new_id;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Notification unavailable' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('id',new_id);
 END IF;
 PERFORM 1 FROM saas.billing_accounts WHERE id=p_account AND owner_id=a FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Billing ownership required' USING ERRCODE='42501';END IF;
 IF p_action='context' THEN
  RETURN jsonb_build_object('accountId',p_account,
   'entitlement',(SELECT jsonb_build_object('plan',e.plan,'status',e.status,'invoice_limit',e.invoices_per_month,'company_limit',e.company_limit,'seat_limit',e.seat_limit,'ors_enabled',e.ors_enabled,'trial_status',e.trial_status,'trial_expires_at',e.trial_expires_at) FROM saas.subscription_entitlements e WHERE e.account_id=p_account),
   'contract',(SELECT to_jsonb(c)||jsonb_build_object('effective_status',CASE WHEN c.status='active' AND c.period_end<=now() OR c.status='past_due' AND c.grace_until<=now() THEN 'expired' ELSE c.status END) FROM platform_admin.contracts c WHERE c.account_id=p_account),
   'plans',(SELECT coalesce(jsonb_agg(p ORDER BY p.price,p.id),'[]') FROM platform_admin.plans p WHERE NOT p.archived),
   'invoices',(SELECT coalesce(jsonb_agg(i ORDER BY i.created_at DESC),'[]') FROM (SELECT inv.id,inv.reference,inv.currency,inv.amount,inv.period_start,inv.period_end,inv.created_at,(SELECT coalesce(sum(r.amount),0) FROM platform_admin.receipts r WHERE r.invoice_id=inv.id) AS collected FROM platform_admin.billing_invoices inv WHERE inv.account_id=p_account ORDER BY inv.created_at DESC,inv.id DESC LIMIT 100) i),
   'requests',(SELECT coalesce(jsonb_agg(r ORDER BY r.created_at DESC),'[]') FROM (SELECT id,kind,plan_id,message,state,created_at FROM platform_admin.billing_requests WHERE account_id=p_account ORDER BY created_at DESC,id DESC LIMIT 100) r),
   'history',(SELECT coalesce(jsonb_agg(h ORDER BY h.created_at DESC),'[]') FROM (SELECT action,target_id,created_at FROM platform_admin.billing_events WHERE account_id=p_account ORDER BY created_at DESC,id DESC LIMIT 100) h),
   'usage',jsonb_build_object('invoices_this_month',(SELECT count(*) FROM business.invoice_usage WHERE account_id=p_account AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),'companies',(SELECT count(*) FROM saas.company_profiles WHERE account_id=p_account AND status<>'archived'),'members',(SELECT count(DISTINCT m.user_id) FROM web_auth.company_memberships m JOIN saas.company_profiles p ON p.company_id=m.company_id WHERE p.account_id=p_account AND m.status='active')));
 END IF;
 IF p_action NOT IN('change_plan','cancel') OR p_key IS NULL OR p_key!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_body)<>'object' OR octet_length(p_body::text)>10000 OR length(trim(p_body->>'message')) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Invalid billing request' USING ERRCODE='22023';END IF;
 IF p_action='change_plan' AND NOT EXISTS(SELECT 1 FROM platform_admin.plans WHERE id=(p_body->>'plan_id')::uuid AND NOT archived) THEN RAISE EXCEPTION 'Plan unavailable' USING ERRCODE='22023';END IF;
 req=jsonb_build_object('scope','customer','account',p_account,'action',p_action,'body',p_body);
 INSERT INTO platform_admin.commands(actor_id,key,request) VALUES(a,p_key,req) ON CONFLICT DO NOTHING;
 SELECT * INTO existing FROM platform_admin.commands WHERE actor_id=a AND key=p_key FOR UPDATE;
 IF existing.request IS DISTINCT FROM req THEN RAISE EXCEPTION 'Request reference conflict' USING ERRCODE='23505';END IF;
 IF existing.response IS NOT NULL THEN RETURN existing.response;END IF;
 INSERT INTO platform_admin.billing_requests(account_id,actor_id,kind,plan_id,message) VALUES(p_account,a,p_action,CASE WHEN p_action='change_plan' THEN (p_body->>'plan_id')::uuid ELSE NULL END,trim(p_body->>'message')) RETURNING id INTO new_id;
 INSERT INTO platform_admin.billing_events(account_id,actor_id,action,target_id) VALUES(p_account,a,'customer.request.'||p_action,new_id);
 result=jsonb_build_object('id',new_id,'state','open','paymentConfirmed',false);UPDATE platform_admin.commands SET response=result WHERE actor_id=a AND key=p_key;RETURN result;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA platform_admin FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform_admin FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT USAGE ON SCHEMA platform_admin TO vtv_web_runtime;
GRANT EXECUTE ON FUNCTION platform_admin.security(text,text,bytea,text),platform_admin.read(text,text,text,uuid,text),platform_admin.command(text,text,text,uuid,bigint,jsonb,text,text),platform_admin.ticket(text,uuid),platform_admin.profile(text,text,uuid),platform_admin.customer(text,uuid,text,jsonb,text),platform_admin.billing_detail(text,uuid),platform_admin.lead_timeline(text,uuid) TO vtv_web_runtime;
RESET ROLE;
COMMIT;

-- STAGE A REVIEW CANDIDATE. NOT EXECUTED. Fresh isolated cluster only.
-- Target: 127.0.0.1:55440/vtv_saas_dev; database owner vtv_saas_database_owner.
-- No existing authentication DB, production DB or browser data is modified.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR inet_server_port()<>55440
 OR host(inet_server_addr())<>'127.0.0.1' OR session_user<>'vtv_saas_operator'
 OR current_user<>session_user OR current_setting('server_version_num')::int<170000
 OR NOT EXISTS(SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database() AND r.rolname='vtv_saas_database_owner' AND NOT(r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls))
 THEN RAISE EXCEPTION 'Refusing unapproved target or ownership'; END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','information_schema') AND nspname !~ '^pg_')
 THEN RAISE EXCEPTION 'Refusing nonempty database schemas'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','v','m','S','f'))
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace)
 OR EXISTS(SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace)
 THEN RAISE EXCEPTION 'Refusing existing public records/objects'; END IF;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('vtv_web_owner','vtv_web_runtime','vtv_saas_owner','vtv_saas_runtime')) THEN RAISE EXCEPTION 'Refusing existing application roles'; END IF;
END $$;
CREATE ROLE vtv_web_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE vtv_web_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA web_auth AUTHORIZATION vtv_web_owner;
SET LOCAL ROLE vtv_web_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA web_auth REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA web_auth REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE web_auth.installation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),version integer NOT NULL CHECK(version=1),created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO web_auth.installation(version) VALUES(1);
CREATE TABLE web_auth.users(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),full_name text NOT NULL CHECK(length(full_name) BETWEEN 1 AND 120),
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
 password_hash text NOT NULL CHECK(password_hash LIKE '$argon2id$%' AND length(password_hash)<=512),
 email_verified_at timestamptz,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE web_auth.sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES web_auth.users(id),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL,
 revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>created_at));
CREATE INDEX sessions_user_live ON web_auth.sessions(user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE web_auth.roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL UNIQUE,description text NOT NULL);
INSERT INTO web_auth.roles(name,description) VALUES('software_administrator','Explicit operator-assigned system administrator; never granted by registration or email');
CREATE TABLE web_auth.user_roles(user_id uuid NOT NULL REFERENCES web_auth.users(id),role_id uuid NOT NULL REFERENCES web_auth.roles(id),assigned_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,role_id));
CREATE TABLE web_auth.companies(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),owner_id uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX companies_owner ON web_auth.companies(owner_id);
CREATE TABLE web_auth.company_memberships(user_id uuid NOT NULL REFERENCES web_auth.users(id),company_id uuid NOT NULL REFERENCES web_auth.companies(id),role text NOT NULL CHECK(role IN('Owner','Admin','Finance','Accountant','Procurement','Inventory','Staff','Viewer')),status text NOT NULL CHECK(status IN('active','suspended')),PRIMARY KEY(user_id,company_id));
CREATE INDEX memberships_company ON web_auth.company_memberships(company_id,user_id) WHERE status='active';
CREATE TABLE web_auth.password_reset_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES web_auth.users(id),token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>created_at));
CREATE INDEX reset_user_live ON web_auth.password_reset_tokens(user_id,expires_at) WHERE used_at IS NULL;
CREATE TABLE web_auth.email_verification_tokens(LIKE web_auth.password_reset_tokens INCLUDING ALL);
ALTER TABLE web_auth.email_verification_tokens ADD FOREIGN KEY(user_id) REFERENCES web_auth.users(id);
CREATE TABLE web_auth.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_user_id uuid REFERENCES web_auth.users(id),company_id uuid REFERENCES web_auth.companies(id),action text NOT NULL CHECK(length(action)<=100),metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_actor_date ON web_auth.audit_logs(actor_user_id,created_at DESC);
CREATE TABLE web_auth.rate_limits(key char(64) PRIMARY KEY CHECK(key ~ '^[a-f0-9]{64}$'),count integer NOT NULL CHECK(count>=0),expires_at timestamptz NOT NULL);
CREATE TABLE web_auth.notification_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES web_auth.users(id),kind text NOT NULL CHECK(kind IN('verify_email','reset_password')),ciphertext text NOT NULL,iv char(24) NOT NULL,tag char(32) NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','review')),attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),lease_id uuid,lease_until timestamptz,provider_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_outbox_pending ON web_auth.notification_outbox(available_at) WHERE state='pending';
CREATE TABLE web_auth.bootstrap_once(id boolean PRIMARY KEY DEFAULT true CHECK(id),user_id uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now());

-- SAAS_CORE_FOLLOWS
RESET ROLE;
CREATE ROLE vtv_saas_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE vtv_saas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA saas AUTHORIZATION vtv_saas_owner;
REVOKE ALL ON DATABASE vtv_saas_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE vtv_saas_dev TO vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON SCHEMA public,web_auth,saas FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA web_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA web_auth TO vtv_web_runtime,vtv_saas_owner;
GRANT SELECT ON web_auth.installation,web_auth.users,web_auth.sessions,web_auth.roles,web_auth.user_roles,web_auth.companies,web_auth.company_memberships TO vtv_web_runtime;
GRANT INSERT ON web_auth.users,web_auth.sessions,web_auth.companies,web_auth.company_memberships,web_auth.audit_logs TO vtv_web_runtime;
GRANT UPDATE(password_hash,email_verified_at,updated_at) ON web_auth.users TO vtv_web_runtime;
GRANT UPDATE(revoked_at,last_seen_at) ON web_auth.sessions TO vtv_web_runtime;
GRANT SELECT,INSERT,UPDATE ON web_auth.password_reset_tokens,web_auth.email_verification_tokens,web_auth.rate_limits,web_auth.notification_outbox TO vtv_web_runtime;
GRANT DELETE ON web_auth.rate_limits TO vtv_web_runtime;
-- Trusted NOLOGIN function owner gets only the identity fields it needs, never
-- password hashes. UPDATE on an ID column permits SELECT FOR SHARE row locks;
-- no callable function below performs any identity-table update.
GRANT SELECT(id,status,email_verified_at),UPDATE(id) ON web_auth.users TO vtv_saas_owner;
GRANT SELECT(id,user_id,token_hash,expires_at,revoked_at),UPDATE(id) ON web_auth.sessions TO vtv_saas_owner;
GRANT SELECT(id,name,owner_id),UPDATE(id) ON web_auth.companies TO vtv_saas_owner;
GRANT SELECT,UPDATE(user_id) ON web_auth.company_memberships TO vtv_saas_owner;
GRANT REFERENCES(id) ON web_auth.users,web_auth.sessions,web_auth.companies TO vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA saas REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA saas REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA saas REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE saas.schema_version(version integer PRIMARY KEY CHECK(version=1),installation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO saas.schema_version(version) VALUES(1);
CREATE TABLE saas.permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE CHECK(length(code) BETWEEN 3 AND 80));
CREATE TABLE saas.company_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE);
CREATE TABLE saas.role_permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),role_id uuid NOT NULL REFERENCES saas.company_roles(id),permission_id uuid NOT NULL REFERENCES saas.permissions(id),UNIQUE(role_id,permission_id));
INSERT INTO saas.permissions(code) VALUES ('company:read'),('company:manage'),('members:manage'),('billing:manage'),('contacts:read'),('contacts:write'),('documents:read'),('documents:write'),('invoices:read'),('invoices:write'),('invoices:confirm'),('invoices:correct'),('banking:read'),('banking:write'),('reports:read'),('reports:export'),('audit:read'),('procurement:read'),('procurement:write'),('procurement:approve'),('inventory:read'),('inventory:receive'),('inventory:adjust'),('inventory:transfer'),('sales:read'),('sales:write'),('sales:approve'),('fulfilment:write');
INSERT INTO saas.company_roles(code) VALUES ('Owner'),('Admin'),('Finance'),('Accountant'),('Procurement'),('Inventory'),('Staff'),('Viewer');
INSERT INTO saas.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM (VALUES ('Owner','company:read'),('Owner','company:manage'),('Owner','members:manage'),('Owner','billing:manage'),('Owner','contacts:read'),('Owner','contacts:write'),('Owner','documents:read'),('Owner','documents:write'),('Owner','invoices:read'),('Owner','invoices:write'),('Owner','invoices:confirm'),('Owner','invoices:correct'),('Owner','banking:read'),('Owner','banking:write'),('Owner','reports:read'),('Owner','reports:export'),('Owner','audit:read'),('Owner','procurement:read'),('Owner','procurement:write'),('Owner','procurement:approve'),('Owner','inventory:read'),('Owner','inventory:receive'),('Owner','inventory:adjust'),('Owner','inventory:transfer'),('Owner','sales:read'),('Owner','sales:write'),('Owner','sales:approve'),('Owner','fulfilment:write'),('Admin','company:read'),('Admin','company:manage'),('Admin','members:manage'),('Admin','contacts:read'),('Admin','contacts:write'),('Admin','documents:read'),('Admin','documents:write'),('Admin','invoices:read'),('Admin','invoices:write'),('Admin','invoices:confirm'),('Admin','invoices:correct'),('Admin','banking:read'),('Admin','banking:write'),('Admin','reports:read'),('Admin','reports:export'),('Admin','audit:read'),('Admin','procurement:read'),('Admin','procurement:write'),('Admin','procurement:approve'),('Admin','inventory:read'),('Admin','inventory:receive'),('Admin','inventory:adjust'),('Admin','inventory:transfer'),('Admin','sales:read'),('Admin','sales:write'),('Admin','sales:approve'),('Admin','fulfilment:write'),('Finance','company:read'),('Finance','contacts:read'),('Finance','contacts:write'),('Finance','documents:read'),('Finance','documents:write'),('Finance','invoices:read'),('Finance','invoices:write'),('Finance','invoices:confirm'),('Finance','invoices:correct'),('Finance','banking:read'),('Finance','banking:write'),('Finance','reports:read'),('Finance','reports:export'),('Finance','audit:read'),('Finance','procurement:read'),('Finance','sales:read'),('Accountant','company:read'),('Accountant','contacts:read'),('Accountant','documents:read'),('Accountant','invoices:read'),('Accountant','banking:read'),('Accountant','reports:read'),('Accountant','reports:export'),('Procurement','company:read'),('Procurement','contacts:read'),('Procurement','documents:read'),('Procurement','documents:write'),('Procurement','procurement:read'),('Procurement','procurement:write'),('Procurement','inventory:read'),('Inventory','company:read'),('Inventory','documents:read'),('Inventory','procurement:read'),('Inventory','inventory:read'),('Inventory','inventory:receive'),('Inventory','inventory:transfer'),('Inventory','sales:read'),('Inventory','fulfilment:write'),('Staff','company:read'),('Staff','contacts:read'),('Staff','documents:read'),('Staff','documents:write'),('Staff','invoices:read'),('Staff','invoices:write'),('Staff','procurement:read'),('Staff','procurement:write'),('Staff','sales:read'),('Staff','sales:write'),('Viewer','company:read'),('Viewer','contacts:read'),('Viewer','invoices:read'),('Viewer','reports:read'),('Viewer','procurement:read'),('Viewer','inventory:read'),('Viewer','sales:read') ) AS policy(role,permission) JOIN saas.company_roles r ON r.code=policy.role JOIN saas.permissions p ON p.code=policy.permission;
CREATE TABLE saas.billing_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES web_auth.users(id),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','suspended','closed')),created_at timestamptz NOT NULL DEFAULT now(),version bigint NOT NULL DEFAULT 1 CHECK(version>0));
CREATE TABLE saas.billing_memberships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),user_id uuid NOT NULL REFERENCES web_auth.users(id),role text NOT NULL CHECK(role IN('Owner','BillingAdmin','Member')),status text NOT NULL CHECK(status IN('active','suspended')),UNIQUE(account_id,user_id));
CREATE TABLE saas.subscription_entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL UNIQUE REFERENCES saas.billing_accounts(id),plan text CHECK(plan IN('Basic','Starter','Growth')),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','past_due','cancelled')),invoices_per_month integer CHECK(invoices_per_month>0),company_limit integer CHECK(company_limit>0),seat_limit integer CHECK(seat_limit>0),history_days integer CHECK(history_days>0),ors_enabled boolean NOT NULL DEFAULT false,verified_at timestamptz,source_reference text,version bigint NOT NULL DEFAULT 1 CHECK(version>0),CHECK(status<>'active' OR (verified_at IS NOT NULL AND source_reference IS NOT NULL AND length(source_reference) BETWEEN 1 AND 200 AND plan IS NOT NULL AND invoices_per_month IS NOT NULL AND company_limit IS NOT NULL AND seat_limit IS NOT NULL AND ((plan='Basic' AND invoices_per_month=30 AND company_limit=2 AND seat_limit=2 AND history_days IS NOT NULL AND history_days=90) OR (plan='Starter' AND invoices_per_month=100 AND company_limit=2 AND seat_limit=4 AND history_days IS NOT NULL AND history_days=180 AND ors_enabled) OR (plan='Growth' AND invoices_per_month=300 AND company_limit=3 AND seat_limit=6 AND history_days IS NULL AND ors_enabled)))));
CREATE TABLE saas.company_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL UNIQUE REFERENCES web_auth.companies(id),account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','suspended','archived')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(account_id,company_id));
CREATE INDEX company_profiles_account ON saas.company_profiles(account_id,company_id);
CREATE TABLE saas.company_selections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL UNIQUE REFERENCES web_auth.sessions(id),company_id uuid NOT NULL REFERENCES web_auth.companies(id),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE saas.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 200),mime_type text NOT NULL CHECK(mime_type IN('application/pdf','image/jpeg','image/png','image/webp')),byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),object_key text NOT NULL UNIQUE,object_version text CHECK(length(object_version) BETWEEN 1 AND 1024 AND object_version<>'null'),state text NOT NULL DEFAULT 'awaiting_upload' CHECK(state IN('awaiting_upload','quarantined','clean','rejected','missing')),created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),UNIQUE(company_id,sha256),CHECK(object_key='companies/'||company_id::text||'/documents/'||id::text||'/'||sha256::text),CHECK(state='awaiting_upload' OR object_version IS NOT NULL));
CREATE TABLE saas.document_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,document_id uuid NOT NULL,object_version text NOT NULL,sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),verdict text NOT NULL CHECK(verdict IN('clean','infected','error')),scanner text NOT NULL CHECK(length(scanner) BETWEEN 1 AND 200),policy_version text NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id));
CREATE TABLE saas.document_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,document_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('inspect','extract')),state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','completed','failed')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),lease_id uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id),UNIQUE(company_id,document_id,kind));
CREATE INDEX document_jobs_pending ON saas.document_jobs(available_at,id) WHERE state='queued';
CREATE TABLE saas.idempotency_keys(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),user_id uuid NOT NULL REFERENCES web_auth.users(id),operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 100),key_hash char(64) NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),response jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,user_id,operation,key_hash));
CREATE TABLE saas.audit_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),action text NOT NULL CHECK(length(action) BETWEEN 1 AND 100),entity_id uuid NOT NULL,request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_company_date ON saas.audit_events(company_id,created_at DESC,id);
CREATE TABLE saas.notification_outbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 100),ciphertext text NOT NULL,iv char(24) NOT NULL,tag char(32) NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','review')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),available_at timestamptz NOT NULL DEFAULT now(),lease_id uuid,lease_until timestamptz,provider_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notification_outbox_pending ON saas.notification_outbox(available_at,id) WHERE state='pending';

CREATE FUNCTION saas.current_session() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT s.id FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL;
$$;
CREATE FUNCTION saas.current_actor() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT user_id FROM web_auth.sessions WHERE id=saas.current_session();
$$;
CREATE FUNCTION saas.authorized_company(target uuid,required text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT target::text=current_setting('app.company_id',true) AND EXISTS(
 SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN saas.company_profiles cp ON cp.company_id=m.company_id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.id=saas.current_session() AND m.status='active' AND cp.status='active' AND a.status='active');
$$;
CREATE FUNCTION saas.lock_authorization(target uuid,required text) RETURNS TABLE(actor_id uuid,session_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF target::text IS DISTINCT FROM current_setting('app.company_id',true) THEN RETURN; END IF;
 RETURN QUERY SELECT u.id,s.id FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 JOIN web_auth.companies c ON c.id=m.company_id
 JOIN saas.company_profiles cp ON cp.company_id=c.id JOIN saas.billing_accounts a ON a.id=cp.account_id
 JOIN saas.company_roles r ON r.code=m.role JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code=required
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.status='active' AND cp.status='active' AND a.status='active'
 FOR SHARE OF s,u,m,c,cp,a,r,rp,p;
END $$;
CREATE FUNCTION saas.company_context(target uuid) RETURNS TABLE(id uuid,name text,currency text,role text,account_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT c.id,c.name,cp.currency,m.role,cp.account_id FROM web_auth.companies c JOIN saas.company_profiles cp ON cp.company_id=c.id JOIN web_auth.company_memberships m ON m.company_id=c.id AND m.user_id=saas.current_actor()
 WHERE c.id=target AND saas.authorized_company(target,'company:read');
$$;
CREATE FUNCTION saas.reject_immutable_change() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Immutable history cannot be changed'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON saas.audit_events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER immutable_inspection BEFORE UPDATE OR DELETE ON saas.document_inspections FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
-- Every tenant table defaults to denial. Owner-only SELECT policies permit the
-- narrow SECURITY DEFINER authorizer to work even under FORCE RLS.
DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['billing_accounts','billing_memberships','subscription_entitlements','company_profiles','company_selections','documents','document_inspections','document_jobs','idempotency_keys','audit_events','notification_outbox'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',item);
  EXECUTE format('CREATE POLICY owner_lookup ON saas.%I FOR SELECT TO vtv_saas_owner USING(true)',item);
 END LOOP;
END $$;
CREATE POLICY profiles_read ON saas.company_profiles FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'company:read'));
CREATE POLICY selection_read ON saas.company_selections FOR SELECT TO vtv_saas_runtime USING(session_id=saas.current_session());
CREATE POLICY selection_insert ON saas.company_selections FOR INSERT TO vtv_saas_runtime WITH CHECK(session_id=saas.current_session() AND saas.authorized_company(company_id,'company:read'));
CREATE POLICY selection_update ON saas.company_selections FOR UPDATE TO vtv_saas_runtime USING(session_id=saas.current_session()) WITH CHECK(session_id=saas.current_session() AND saas.authorized_company(company_id,'company:read'));
CREATE POLICY documents_read ON saas.documents FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:read'));
CREATE POLICY documents_reserve ON saas.documents FOR INSERT TO vtv_saas_runtime WITH CHECK(saas.authorized_company(company_id,'documents:write') AND created_by=saas.current_actor() AND state='awaiting_upload' AND object_version IS NULL);
CREATE POLICY documents_upload ON saas.documents FOR UPDATE TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:write') AND state='awaiting_upload') WITH CHECK(saas.authorized_company(company_id,'documents:write') AND state='quarantined' AND object_version IS NOT NULL);
CREATE POLICY inspection_read ON saas.document_inspections FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:read'));
CREATE POLICY jobs_read ON saas.document_jobs FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:read'));
CREATE POLICY jobs_queue ON saas.document_jobs FOR INSERT TO vtv_saas_runtime WITH CHECK(saas.authorized_company(company_id,'documents:write') AND kind='inspect' AND state='queued' AND attempts=0 AND lease_id IS NULL AND lease_until IS NULL);
CREATE POLICY idempotency_read ON saas.idempotency_keys FOR SELECT TO vtv_saas_runtime USING(user_id=saas.current_actor() AND saas.authorized_company(company_id,'documents:write'));
CREATE POLICY idempotency_insert ON saas.idempotency_keys FOR INSERT TO vtv_saas_runtime WITH CHECK(user_id=saas.current_actor() AND operation='document.upload' AND response IS NULL AND saas.authorized_company(company_id,'documents:write'));
CREATE POLICY idempotency_complete ON saas.idempotency_keys FOR UPDATE TO vtv_saas_runtime USING(user_id=saas.current_actor() AND saas.authorized_company(company_id,'documents:write')) WITH CHECK(user_id=saas.current_actor() AND saas.authorized_company(company_id,'documents:write'));
CREATE POLICY audit_insert ON saas.audit_events FOR INSERT TO vtv_saas_runtime WITH CHECK(actor_id=saas.current_actor() AND saas.authorized_company(company_id,current_setting('app.permission',true)));
CREATE POLICY audit_read ON saas.audit_events FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'audit:read'));
REVOKE ALL ON ALL TABLES IN SCHEMA saas FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;
GRANT USAGE ON SCHEMA saas TO vtv_saas_runtime;
GRANT SELECT ON saas.schema_version,saas.company_profiles,saas.company_selections,saas.documents,saas.document_inspections,saas.document_jobs,saas.idempotency_keys,saas.audit_events TO vtv_saas_runtime;
GRANT INSERT ON saas.company_selections,saas.documents,saas.document_jobs,saas.idempotency_keys,saas.audit_events TO vtv_saas_runtime;
GRANT UPDATE(company_id,updated_at) ON saas.company_selections TO vtv_saas_runtime;
GRANT UPDATE(object_version,state) ON saas.documents TO vtv_saas_runtime;
GRANT UPDATE(response) ON saas.idempotency_keys TO vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION saas.current_session(),saas.current_actor(),saas.authorized_company(uuid,text),saas.lock_authorization(uuid,text),saas.company_context(uuid) TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

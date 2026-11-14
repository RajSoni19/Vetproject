-- REVIEW REQUIRED. Never run automatically on import/build/start.
-- Target: explicitly selected EMPTY database; PostgreSQL 17+.
-- No passwords or user/administrator accounts are embedded here.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN('web_auth','web_business')) THEN RAISE EXCEPTION 'Refusing existing web schema'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('vtv_web_owner','vtv_web_runtime','vtv_web_business')) THEN RAISE EXCEPTION 'Refusing existing web roles'; END IF;
END $$;
CREATE ROLE vtv_web_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE vtv_web_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE vtv_web_business LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA web_auth AUTHORIZATION vtv_web_owner;
CREATE SCHEMA web_business AUTHORIZATION vtv_web_owner;
SET LOCAL ROLE vtv_web_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA web_auth REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA web_auth REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA web_business REVOKE ALL ON TABLES FROM PUBLIC;
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
CREATE TABLE web_auth.company_memberships(user_id uuid NOT NULL REFERENCES web_auth.users(id),company_id uuid NOT NULL REFERENCES web_auth.companies(id),role text NOT NULL CHECK(role IN('Owner','Admin','Finance','Accountant','Staff','Viewer')),status text NOT NULL CHECK(status IN('active','suspended')),PRIMARY KEY(user_id,company_id));
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
-- Business data foundation. Documents contain private object metadata, NOT bytes.
CREATE TABLE web_business.suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),vat_number text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id));
CREATE TABLE web_business.customers(LIKE web_business.suppliers INCLUDING ALL);
ALTER TABLE web_business.customers ADD FOREIGN KEY(company_id) REFERENCES web_auth.companies(id);
CREATE TABLE web_business.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),object_key text NOT NULL CHECK(length(object_key) BETWEEN 1 AND 1024),sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),content_type text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes>0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),UNIQUE(company_id,object_key));
CREATE TABLE web_business.invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),supplier_id uuid,customer_id uuid,document_id uuid,invoice_number text NOT NULL CHECK(length(invoice_number)<=120),direction text NOT NULL CHECK(direction IN('Purchase','Sale')),currency char(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),net numeric(18,2) NOT NULL CHECK(net>=0),vat numeric(18,2) NOT NULL CHECK(vat>=0),gross numeric(18,2) NOT NULL CHECK(gross=net+vat),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),FOREIGN KEY(company_id,supplier_id) REFERENCES web_business.suppliers(company_id,id),FOREIGN KEY(company_id,customer_id) REFERENCES web_business.customers(company_id,id),FOREIGN KEY(company_id,document_id) REFERENCES web_business.documents(company_id,id));
CREATE TABLE web_business.invoice_line_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,description text NOT NULL CHECK(length(description)<=2000),quantity numeric(18,4) NOT NULL CHECK(quantity>0),unit_price numeric(18,4) NOT NULL CHECK(unit_price>=0),vat_rate numeric(6,2) NOT NULL CHECK(vat_rate BETWEEN 0 AND 100),FOREIGN KEY(company_id,invoice_id) REFERENCES web_business.invoices(company_id,id));
CREATE TABLE web_business.ors_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),supplier_id uuid,status text NOT NULL CHECK(status IN('draft','approved','ordered','part_received','received','closed')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),FOREIGN KEY(company_id,supplier_id) REFERENCES web_business.suppliers(company_id,id));
CREATE TABLE web_business.inventory(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 120),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK(quantity>=0),UNIQUE(company_id,id),UNIQUE(company_id,sku));
CREATE TABLE web_business.ors_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,order_id uuid NOT NULL,inventory_id uuid NOT NULL,quantity numeric(18,4) NOT NULL CHECK(quantity>0),received numeric(18,4) NOT NULL DEFAULT 0 CHECK(received BETWEEN 0 AND quantity),FOREIGN KEY(company_id,order_id) REFERENCES web_business.ors_orders(company_id,id),FOREIGN KEY(company_id,inventory_id) REFERENCES web_business.inventory(company_id,id));
CREATE TABLE web_business.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- Session-hash context is high entropy. Business role cannot read auth session
-- hashes or assign roles. No caller-controlled user ID can grant company access.
CREATE FUNCTION web_auth.can_access_company(target uuid,capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id JOIN web_auth.company_memberships m ON m.user_id=u.id AND m.company_id=target
 WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.status='active' AND
 (m.role IN('Owner','Admin') OR (m.role='Finance' AND capability IN('contacts:read','contacts:write','invoices:read','invoices:write','documents:read','documents:write','banking:read','banking:write','reports:read','ors:read','ors:write')) OR (m.role='Accountant' AND capability IN('contacts:read','invoices:read','documents:read','banking:read','reports:read')) OR (m.role='Staff' AND capability IN('contacts:read','invoices:read','invoices:write','documents:read','documents:write','ors:read')) OR (m.role='Viewer' AND capability IN('contacts:read','invoices:read','reports:read'))));
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA web_auth,web_business FROM PUBLIC;
REVOKE ALL ON FUNCTION web_auth.can_access_company(uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA web_auth TO vtv_web_runtime,vtv_web_business;
GRANT SELECT ON web_auth.installation,web_auth.users,web_auth.sessions,web_auth.roles,web_auth.user_roles,web_auth.companies,web_auth.company_memberships TO vtv_web_runtime;
GRANT INSERT ON web_auth.users,web_auth.sessions,web_auth.companies,web_auth.company_memberships,web_auth.audit_logs TO vtv_web_runtime;
GRANT UPDATE(password_hash,email_verified_at,updated_at) ON web_auth.users TO vtv_web_runtime;
GRANT UPDATE(revoked_at,last_seen_at) ON web_auth.sessions TO vtv_web_runtime;
GRANT SELECT,INSERT,UPDATE ON web_auth.password_reset_tokens,web_auth.email_verification_tokens,web_auth.rate_limits,web_auth.notification_outbox TO vtv_web_runtime;
GRANT DELETE ON web_auth.rate_limits TO vtv_web_runtime;
GRANT USAGE ON SCHEMA web_business TO vtv_web_business;
GRANT EXECUTE ON FUNCTION web_auth.can_access_company(uuid,text) TO vtv_web_business;
DO $$ DECLARE item text; cap text; BEGIN
 FOREACH item IN ARRAY ARRAY['suppliers','customers','documents','invoices','invoice_line_items','ors_orders','ors_order_items','inventory'] LOOP
 cap:=CASE WHEN item IN('suppliers','customers') THEN 'contacts' WHEN item='documents' THEN 'documents' WHEN item IN('invoices','invoice_line_items') THEN 'invoices' ELSE 'ors' END;
 EXECUTE format('ALTER TABLE web_business.%I ENABLE ROW LEVEL SECURITY',item);
 EXECUTE format('ALTER TABLE web_business.%I FORCE ROW LEVEL SECURITY',item);
 EXECUTE format('CREATE POLICY read_scope ON web_business.%I FOR SELECT TO vtv_web_business USING(web_auth.can_access_company(company_id,%L))',item,cap||':read');
 EXECUTE format('CREATE POLICY insert_scope ON web_business.%I FOR INSERT TO vtv_web_business WITH CHECK(web_auth.can_access_company(company_id,%L))',item,cap||':write');
 EXECUTE format('CREATE POLICY update_scope ON web_business.%I FOR UPDATE TO vtv_web_business USING(web_auth.can_access_company(company_id,%L)) WITH CHECK(web_auth.can_access_company(company_id,%L))',item,cap||':write',cap||':write');
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON web_business.%I TO vtv_web_business',item);
 EXECUTE format('CREATE INDEX ON web_business.%I(company_id)',item);
 END LOOP;
END $$;
-- Foundation leads are global administrator data. No business/runtime grant.
ALTER TABLE web_business.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_business.leads FORCE ROW LEVEL SECURITY;
RESET ROLE;
COMMIT;

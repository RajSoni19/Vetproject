-- MILESTONE 4A REVIEW ONLY: alternative EMPTY baseline, not an ALTER migration.
-- DO NOT EXECUTE. No roles/grants/broker have been verified or provisioned.
-- Schema, constraints, privilege revocations and RLS commit atomically.
BEGIN;
DO $$
BEGIN
 IF current_database() NOT IN ('vetthevat_dev','vetthevat_test')
 OR current_user::text <> current_database() || '_owner'
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolcanlogin
   AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Unapproved database/effective NOLOGIN owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_database()||'_runtime'
 AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Restricted runtime role not verified'; END IF;
 IF pg_has_role(current_user,current_database()||'_runtime','MEMBER')
 OR pg_has_role(current_database()||'_runtime',current_user,'MEMBER')
 THEN RAISE EXCEPTION 'Owner/runtime memberships must be separate'; END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
   WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
   AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION 'Review existing creator default ACLs before this draft'; END IF;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE USAGE ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;

CREATE SCHEMA vat;
REVOKE ALL ON SCHEMA vat FROM PUBLIC;

CREATE TABLE vat.app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 status text NOT NULL CHECK (status IN ('active','disabled')),
 display_name text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vat.identities (
 user_id uuid NOT NULL REFERENCES vat.app_users(id),
 firebase_project text NOT NULL, firebase_uid text NOT NULL,
 PRIMARY KEY(firebase_project,firebase_uid), UNIQUE(user_id,firebase_project)
 -- Never bind by email or store Firebase passwords/refresh tokens here.
);
CREATE TABLE vat.web_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES vat.app_users(id),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
 -- Web session strategy requires approval; no mobile-wide token revocation.
);
CREATE TABLE vat.companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 registration_number text, vat_number text, address text, country text, industry text,
 currency text NOT NULL CHECK(currency IN ('GBP','EUR','USD')),
 status text NOT NULL CHECK(status IN ('Active','Review','Archived')),
 vat_period_start date, vat_period_end date, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(vat_period_end IS NULL OR vat_period_start IS NULL OR vat_period_end>=vat_period_start)
);
CREATE TABLE vat.company_members (
 company_id uuid NOT NULL REFERENCES vat.companies(id), user_id uuid NOT NULL REFERENCES vat.app_users(id),
 role text NOT NULL CHECK(role IN ('Owner','Admin','Finance','Accountant','Staff','Viewer')),
 status text NOT NULL CHECK(status IN ('Active','Deactivated')),
 PRIMARY KEY(company_id,user_id)
 -- Invitations are not memberships. Later privileged commands enforce last owner.
);
CREATE TABLE vat.suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 name text NOT NULL, normalized_name text, vat_number text, email text, phone text, address text,
 status text NOT NULL CHECK(status IN ('Active','Review','Archived')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), UNIQUE(company_id,id)
);
CREATE INDEX supplier_lookup ON vat.suppliers(company_id,normalized_name);
CREATE TABLE vat.supplier_aliases (
 company_id uuid NOT NULL, supplier_id uuid NOT NULL, alias text NOT NULL,
 PRIMARY KEY(company_id,supplier_id,alias),
 FOREIGN KEY(company_id,supplier_id) REFERENCES vat.suppliers(company_id,id)
);
CREATE TABLE vat.documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 supplier_id uuid, original_name text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
 storage_state text NOT NULL CHECK(storage_state IN ('pending','available','missing','quarantined')),
 storage_key text UNIQUE, object_version text, byte_size bigint CHECK(byte_size>=0),
 sha256 char(64) CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 review_status text NOT NULL CHECK(review_status IN ('Needs Review','Reviewed','Not Required')),
 uploaded_by uuid REFERENCES vat.app_users(id), uploaded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), FOREIGN KEY(company_id,supplier_id) REFERENCES vat.suppliers(company_id,id),
 CHECK(storage_state<>'available' OR (storage_key IS NOT NULL AND byte_size IS NOT NULL AND sha256 IS NOT NULL))
 -- Never store signed URLs or blob URLs as durable keys. Reattachments create a
 -- new document/version and audit link, preserving the previous metadata.
);
CREATE TABLE vat.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 supplier_id uuid, document_id uuid, invoice_number text, normalized_number text,
 invoice_date date, due_date date, currency text NOT NULL CHECK(currency IN ('GBP','EUR','USD')),
 supplier_name text, supplier_vat_number text, customer_name text, customer_vat_number text,
 transaction_type text CHECK(transaction_type IN ('Purchase','Sale')),
 status text NOT NULL CHECK(status IN ('Draft','Processed','Pending Review','Reviewed','Duplicate Warning','Processing Failed')),
 processing_status text NOT NULL CHECK(processing_status IN ('Uploaded','Processing','Ready for Review','Confirmed','Failed')),
 review_status text NOT NULL CHECK(review_status IN ('Needs Review','Reviewed','Not Required')),
 net numeric(15,2), vat numeric(15,2), gross numeric(15,2),
 source_net numeric(15,2), source_vat numeric(15,2), source_gross numeric(15,2),
 confidence text CHECK(confidence IN ('High','Medium','Needs review')), notes text, payment_status text,
 vat_rate_needs_review boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES vat.suppliers(company_id,id),
 FOREIGN KEY(company_id,document_id) REFERENCES vat.documents(company_id,id),
 CONSTRAINT invoices_check CHECK(status <> 'Reviewed' OR (supplier_id IS NOT NULL AND length(trim(invoice_number))>0 AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL AND net IS NOT NULL AND vat IS NOT NULL AND gross IS NOT NULL AND net+vat=gross)),
 CHECK(net BETWEEN -9999999999999.99 AND 9999999999999.99),
 CHECK(vat BETWEEN -9999999999999.99 AND 9999999999999.99),
 CHECK(gross BETWEEN -9999999999999.99 AND 9999999999999.99)
 -- Duplicate policy remains reviewable, not destructive uniqueness against
 -- unconfirmed names/numbers. Confirmation must lock a canonical duplicate key.
);
CREATE INDEX invoice_duplicate_lookup ON vat.invoices(company_id,supplier_id,normalized_number);
CREATE UNIQUE INDEX invoice_original_owner ON vat.invoices(company_id,document_id) WHERE document_id IS NOT NULL;
CREATE TABLE vat.invoice_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, invoice_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>=0), description text NOT NULL,
 quantity numeric(14,4) NOT NULL, unit_price numeric(14,4) NOT NULL,
 discount numeric(15,2) NOT NULL, vat_rate numeric(5,2) NOT NULL CHECK(vat_rate BETWEEN 0 AND 100),
 net numeric(15,2) NOT NULL, vat numeric(15,2) NOT NULL, gross numeric(15,2) NOT NULL,
 tax_classification text CHECK(tax_classification IN ('Taxable','Zero-rated','Exempt','Out of scope')),
 confidence text CHECK(confidence IN ('High','Needs review')),
 UNIQUE(company_id,invoice_id,position),
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id),
 CHECK(net+vat=gross),
 CHECK(tax_classification IS NULL OR tax_classification='Taxable' OR (vat_rate=0 AND vat=0))
 -- No deduplication of identical lines and no default tax classification/rate.
);
CREATE TABLE vat.invoice_vat_groups (
 company_id uuid NOT NULL, invoice_id uuid NOT NULL, rate numeric(5,2) NOT NULL CHECK(rate BETWEEN 0 AND 100),
 net numeric(15,2) NOT NULL, vat numeric(15,2) NOT NULL, gross numeric(15,2) NOT NULL,
 PRIMARY KEY(company_id,invoice_id,rate), CHECK(net+vat=gross),
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id)
);
CREATE TABLE vat.invoice_warnings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, invoice_id uuid NOT NULL,
 tone text NOT NULL CHECK(tone IN ('warning','danger','info')), title text NOT NULL, description text NOT NULL,
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id)
);
CREATE TABLE vat.bank_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 name text NOT NULL, currency text NOT NULL CHECK(currency IN ('GBP','EUR','USD')),
 status text NOT NULL CHECK(status IN ('Active','Archived')), UNIQUE(company_id,id)
);
CREATE TABLE vat.bank_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, account_id uuid NOT NULL,
 document_id uuid, checksum char(64) CHECK(checksum ~ '^[0-9a-f]{64}$'), column_mapping jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,id), UNIQUE(company_id,account_id,id),
 FOREIGN KEY(company_id,account_id) REFERENCES vat.bank_accounts(company_id,id),
 FOREIGN KEY(company_id,document_id) REFERENCES vat.documents(company_id,id)
);
CREATE TABLE vat.bank_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, account_id uuid NOT NULL,
 import_id uuid NOT NULL, source_row integer NOT NULL CHECK(source_row>0),
 booked_date date NOT NULL, reference text NOT NULL, amount_minor bigint NOT NULL,
 fingerprint text NOT NULL, occurrence integer NOT NULL CHECK(occurrence>0),
 UNIQUE(company_id,id), UNIQUE(company_id,account_id,fingerprint,occurrence),
 FOREIGN KEY(company_id,account_id) REFERENCES vat.bank_accounts(company_id,id),
 FOREIGN KEY(company_id,account_id,import_id) REFERENCES vat.bank_imports(company_id,account_id,id)
);
CREATE TABLE vat.bank_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
 transaction_id uuid NOT NULL, invoice_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0),
 created_by uuid NOT NULL REFERENCES vat.app_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 reversed_at timestamptz, reversed_by uuid REFERENCES vat.app_users(id), reversal_reason text,
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,transaction_id) REFERENCES vat.bank_transactions(company_id,id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id),
 CHECK((reversed_at IS NULL AND reversed_by IS NULL) OR (reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL))
 -- Command locks transaction AND invoices, checks currency/direction/outstanding
 -- aggregate in the same transaction. No delete-based reversal or inferred VAT.
);
CREATE TABLE vat.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 actor_user_id uuid REFERENCES vat.app_users(id), event_type text NOT NULL,
 entity_type text NOT NULL, entity_id uuid, request_id uuid NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
 -- Append via reviewed command only. Imported history has explicit provenance;
 -- runtime gets no UPDATE/DELETE/TRUNCATE grant. Never record tokens or originals.
);
CREATE TABLE vat.invoice_revisions (
 company_id uuid NOT NULL, invoice_id uuid NOT NULL, version bigint NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL, actor_user_id uuid NOT NULL REFERENCES vat.app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,invoice_id,version),
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id)
);
CREATE TABLE vat.idempotency_keys (
 company_id uuid NOT NULL REFERENCES vat.companies(id), user_id uuid NOT NULL REFERENCES vat.app_users(id),
 operation text NOT NULL, key text NOT NULL, payload_sha256 char(64) NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
 response jsonb, expires_at timestamptz NOT NULL,
 PRIMARY KEY(company_id,user_id,operation,key)
 -- Insert/reserve atomically; changed digest conflicts; no automatic write retry.
);
CREATE TABLE vat.legacy_mappings (
 company_id uuid NOT NULL REFERENCES vat.companies(id), source_workspace text NOT NULL,
 source_company text NOT NULL, entity_type text NOT NULL, legacy_id text NOT NULL,
 target_id uuid NOT NULL, source_sha256 char(64) NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(company_id,source_workspace,source_company,entity_type,legacy_id)
 -- Authorised importer validates typed target existence and preserves raw source.
);

-- Owner-approved plan metadata, not a billing provider/subscription activation.
CREATE TABLE vat.billing_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL CHECK(status IN ('active','suspended','closed')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE TABLE vat.billing_members (
 account_id uuid NOT NULL REFERENCES vat.billing_accounts(id), user_id uuid NOT NULL REFERENCES vat.app_users(id),
 role text NOT NULL CHECK(role IN ('Owner','BillingAdmin','Member')), active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(account_id,user_id)
);
ALTER TABLE vat.companies ADD COLUMN billing_account_id uuid NOT NULL REFERENCES vat.billing_accounts(id);
ALTER TABLE vat.companies ADD UNIQUE(billing_account_id,id);
CREATE INDEX company_billing_account ON vat.companies(billing_account_id,id);
CREATE TABLE vat.subscriptions (
 account_id uuid PRIMARY KEY REFERENCES vat.billing_accounts(id), plan text NOT NULL CHECK(plan IN ('Basic','Starter','Growth')),
 state text NOT NULL CHECK(state IN ('pending','active','past_due','cancelled','ended')),
 verified_at timestamptz, provider_reference text, version bigint NOT NULL DEFAULT 1 CHECK(version>0)
 -- No runtime update; verified provider/admin command only, never a client plan.
);
CREATE TABLE vat.usage_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES vat.billing_accounts(id),
 starts_at timestamptz NOT NULL CHECK(isfinite(starts_at)), ends_at timestamptz NOT NULL CHECK(isfinite(ends_at)),
 allowance integer NOT NULL CHECK(allowance IN (30,100,300)), plan_snapshot text NOT NULL CHECK(plan_snapshot IN ('Basic','Starter','Growth')),
 UNIQUE(account_id,id), UNIQUE(account_id,starts_at), CHECK(ends_at>starts_at),
 CHECK((plan_snapshot='Basic' AND allowance=30) OR (plan_snapshot='Starter' AND allowance=100) OR (plan_snapshot='Growth' AND allowance=300))
 -- Provisioning must lock account and reject overlapping periods; no reset/delete.
);
CREATE TABLE vat.invoice_usage (
 account_id uuid NOT NULL, period_id uuid NOT NULL, company_id uuid NOT NULL, invoice_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','committed','released')), lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), committed_at timestamptz,
 PRIMARY KEY(company_id,invoice_id), FOREIGN KEY(account_id,company_id) REFERENCES vat.companies(billing_account_id,id), FOREIGN KEY(account_id,period_id) REFERENCES vat.usage_periods(account_id,id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES vat.invoices(company_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(state<>'pending' OR lease_until IS NOT NULL), CHECK(state<>'committed' OR committed_at IS NOT NULL)
 -- Command locks account+period; count pending+committed; ownership/account FK
 -- checked again by command. Invoice creation+usage+audit share one transaction.
);
CREATE INDEX invoice_usage_period ON vat.invoice_usage(account_id,period_id,state);
CREATE TABLE vat.capacity_reservations (
 account_id uuid NOT NULL REFERENCES vat.billing_accounts(id), resource text NOT NULL CHECK(resource IN ('company','member')),
 resource_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('pending','committed','released')),
 idempotency_key text NOT NULL, lease_until timestamptz, PRIMARY KEY(account_id,resource,resource_id),
 UNIQUE(account_id,resource,idempotency_key), CHECK(state<>'pending' OR lease_until IS NOT NULL)
);
CREATE TABLE vat.customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES vat.companies(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), email text, phone text, address text, vat_number text,
 status text NOT NULL CHECK(status IN ('Active','Review','Archived')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(company_id,id)
);
ALTER TABLE vat.invoices ADD COLUMN customer_id uuid;
ALTER TABLE vat.invoices ADD FOREIGN KEY(company_id,customer_id) REFERENCES vat.customers(company_id,id);
ALTER TABLE vat.invoices ADD CHECK(customer_id IS NULL OR transaction_type='Sale');
-- Supplier identity may be absent for sales; issuer snapshot remains mandatory.
ALTER TABLE vat.invoices DROP CONSTRAINT invoices_check;
ALTER TABLE vat.invoices ADD CONSTRAINT reviewed_invoice_complete CHECK(
 (status<>'Reviewed' AND processing_status<>'Confirmed' AND review_status<>'Reviewed') OR
 (status='Reviewed' AND processing_status='Confirmed' AND review_status='Reviewed'
 AND length(trim(invoice_number))>0 AND invoice_number IS NOT NULL
 AND length(trim(supplier_name))>0 AND supplier_name IS NOT NULL
 AND invoice_date IS NOT NULL AND net IS NOT NULL AND vat IS NOT NULL AND gross IS NOT NULL
 AND gross>0 AND net+vat=gross AND (transaction_type IS DISTINCT FROM 'Sale' OR customer_name IS NOT NULL AND length(trim(customer_name))>0))
);
ALTER TABLE vat.invoices ADD CHECK(net>=0 AND vat>=0 AND gross<=1000000000000);
ALTER TABLE vat.invoices ADD CHECK(invoice_date IS NULL OR isfinite(invoice_date) AND invoice_date>=DATE '1900-01-01');
ALTER TABLE vat.invoices ADD CHECK(due_date IS NULL OR isfinite(due_date) AND due_date>=invoice_date);
ALTER TABLE vat.invoices ADD CHECK(source_net BETWEEN -9999999999999.99 AND 9999999999999.99 AND source_vat BETWEEN -9999999999999.99 AND 9999999999999.99 AND source_gross BETWEEN -9999999999999.99 AND 9999999999999.99);
ALTER TABLE vat.invoice_lines ADD CHECK(quantity>=0 AND quantity<=100000000 AND unit_price>=0 AND unit_price<=100000000 AND discount>=0 AND discount<=quantity*unit_price);
ALTER TABLE vat.invoice_lines ADD CHECK(net>=0 AND net<=1000000000000 AND vat>=0 AND vat<=1000000000000 AND gross>=0 AND gross<=1000000000000);
ALTER TABLE vat.invoice_vat_groups ADD CHECK(net>=0 AND net<=1000000000000 AND vat>=0 AND vat<=1000000000000 AND gross>=0 AND gross<=1000000000000);
ALTER TABLE vat.documents ADD CHECK(byte_size IS NULL OR byte_size BETWEEN 1 AND 10485760);
ALTER TABLE vat.documents ADD CHECK(storage_state<>'available' OR length(trim(storage_key))>0 AND length(trim(object_version))>0 AND object_version IS NOT NULL);
ALTER TABLE vat.bank_transactions ADD CHECK(amount_minor<>0 AND amount_minor BETWEEN -9007199254740991 AND 9007199254740991 AND isfinite(booked_date));
ALTER TABLE vat.bank_transactions ADD UNIQUE(company_id,import_id,source_row);
CREATE UNIQUE INDEX active_bank_allocation_pair ON vat.bank_allocations(company_id,transaction_id,invoice_id) WHERE reversed_at IS NULL;
CREATE INDEX allocation_transaction ON vat.bank_allocations(company_id,transaction_id) WHERE reversed_at IS NULL;
CREATE INDEX allocation_invoice ON vat.bank_allocations(company_id,invoice_id) WHERE reversed_at IS NULL;
CREATE INDEX invoice_period ON vat.invoices(company_id,invoice_date,id);
CREATE INDEX invoice_customer ON vat.invoices(company_id,customer_id);
CREATE INDEX document_supplier ON vat.documents(company_id,supplier_id);
CREATE INDEX membership_user ON vat.company_members(user_id,company_id);
CREATE INDEX invoice_warning_parent ON vat.invoice_warnings(company_id,invoice_id);
CREATE INDEX bank_import_document ON vat.bank_imports(company_id,document_id);
CREATE INDEX customer_lookup ON vat.customers(company_id,name);

-- Separate trusted broker writes short-lived claims using a SEPARATELY approved
-- credential. Runtime cannot SELECT/INSERT claims. No broker grants in this draft.
CREATE TABLE vat.context_tickets (
 ticket_hash text PRIMARY KEY CHECK(ticket_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES vat.app_users(id), company_id uuid NOT NULL REFERENCES vat.companies(id),
 backend_pid integer NOT NULL CHECK(backend_pid>0), transaction_id xid8 NOT NULL,
 runtime_role name NOT NULL, capabilities text[] NOT NULL,
 expires_at timestamptz NOT NULL CHECK(isfinite(expires_at)), revoked_at timestamptz
);
CREATE INDEX context_expiry ON vat.context_tickets(expires_at);
CREATE TABLE vat.role_capabilities (role text NOT NULL, capability text NOT NULL, PRIMARY KEY(role,capability));
INSERT INTO vat.role_capabilities(role,capability) VALUES
 ('Owner','company:read'),
 ('Owner','company:manage'),
 ('Owner','contacts:read'),
 ('Owner','contacts:write'),
 ('Owner','invoices:read'),
 ('Owner','invoices:write'),
 ('Owner','documents:read'),
 ('Owner','documents:write'),
 ('Owner','banking:read'),
 ('Owner','banking:write'),
 ('Owner','reports:read'),
 ('Owner','reports:export'),
 ('Owner','team:manage'),
 ('Owner','audit:read'),
 ('Owner','billing:manage'),
 ('Admin','company:read'),
 ('Admin','company:manage'),
 ('Admin','contacts:read'),
 ('Admin','contacts:write'),
 ('Admin','invoices:read'),
 ('Admin','invoices:write'),
 ('Admin','documents:read'),
 ('Admin','documents:write'),
 ('Admin','banking:read'),
 ('Admin','banking:write'),
 ('Admin','reports:read'),
 ('Admin','reports:export'),
 ('Admin','team:manage'),
 ('Admin','audit:read'),
 ('Finance','company:read'),
 ('Finance','contacts:read'),
 ('Finance','contacts:write'),
 ('Finance','invoices:read'),
 ('Finance','invoices:write'),
 ('Finance','documents:read'),
 ('Finance','documents:write'),
 ('Finance','banking:read'),
 ('Finance','banking:write'),
 ('Finance','reports:read'),
 ('Finance','reports:export'),
 ('Accountant','company:read'),
 ('Accountant','contacts:read'),
 ('Accountant','invoices:read'),
 ('Accountant','documents:read'),
 ('Accountant','banking:read'),
 ('Accountant','reports:read'),
 ('Accountant','reports:export'),
 ('Staff','company:read'),
 ('Staff','contacts:read'),
 ('Staff','invoices:read'),
 ('Staff','invoices:write'),
 ('Staff','documents:read'),
 ('Staff','documents:write'),
 ('Viewer','company:read'),
 ('Viewer','contacts:read'),
 ('Viewer','invoices:read'),
 ('Viewer','reports:read');

-- All tables forced RLS BEFORE commit. No runtime DML/SELECT grants in candidate.
DO $$ DECLARE relation record; BEGIN
 FOR relation IN SELECT tablename FROM pg_tables WHERE schemaname='vat' LOOP
  EXECUTE format('ALTER TABLE vat.%I ENABLE ROW LEVEL SECURITY',relation.tablename);
  EXECUTE format('ALTER TABLE vat.%I FORCE ROW LEVEL SECURITY',relation.tablename);
 END LOOP;
 -- Narrow owner-only helper reads. Runtime must not inherit/SET this owner role.
 EXECUTE format('CREATE POLICY broker_lookup ON vat.context_tickets FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.app_users FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.company_members FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.companies FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.billing_accounts FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.billing_members FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY broker_lookup ON vat.role_capabilities FOR SELECT TO %I USING (true)',current_user);
END $$;
CREATE FUNCTION vat.authorized_company(target_company uuid,required_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,vat AS $$
 SELECT EXISTS (
  SELECT 1 FROM vat.context_tickets t
  JOIN vat.app_users u ON u.id=t.user_id AND u.status='active'
  JOIN vat.companies c ON c.id=t.company_id AND c.status='Active'
  JOIN vat.billing_accounts a ON a.id=c.billing_account_id AND a.status='active'
  JOIN vat.company_members m ON m.company_id=c.id AND m.user_id=u.id AND m.status='Active'
  JOIN vat.billing_members b ON b.account_id=c.billing_account_id AND b.user_id=u.id AND b.active
  JOIN vat.role_capabilities r ON r.role=m.role AND r.capability=required_capability
  WHERE t.company_id=target_company AND t.runtime_role=session_user
   AND t.backend_pid=pg_backend_pid() AND t.transaction_id=pg_current_xact_id()
   AND t.expires_at>statement_timestamp() AND t.revoked_at IS NULL
   AND required_capability=ANY(t.capabilities)
   AND t.ticket_hash=encode(sha256(convert_to(coalesce(current_setting('app.context_ticket',true),''),'UTF8')),'hex')
 )
$$;
REVOKE ALL ON FUNCTION vat.authorized_company(uuid,text) FROM PUBLIC;
DO $$ DECLARE relation text; capability text; runtime_role text:=current_database()||'_runtime'; BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN RAISE EXCEPTION 'Runtime role not verified'; END IF;
 FOREACH relation IN ARRAY ARRAY['companies','suppliers','supplier_aliases','customers','documents','invoices','invoice_lines','invoice_vat_groups','invoice_warnings','bank_accounts','bank_imports','bank_transactions','bank_allocations','audit_events','invoice_revisions'] LOOP
  capability:=CASE
   WHEN relation='companies' THEN 'company:read'
   WHEN relation IN ('suppliers','supplier_aliases','customers') THEN 'contacts:read'
   WHEN relation='documents' THEN 'documents:read'
   WHEN relation LIKE 'bank_%' THEN 'banking:read'
   WHEN relation='audit_events' THEN 'audit:read'
   ELSE 'invoices:read' END;
  EXECUTE format('CREATE POLICY capability_read ON vat.%I FOR SELECT TO %I USING (vat.authorized_company(%I,%L))',relation,runtime_role,CASE WHEN relation='companies' THEN 'id' ELSE 'company_id' END,capability);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA vat FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA vat FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vat FROM PUBLIC;
COMMIT;
-- STOP: no runtime grants, no write policies, no broker provisioning/credential.
-- This is not a production-ready schema. Review README and test every invariant.

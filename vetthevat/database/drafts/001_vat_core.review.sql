-- REVIEW ONLY. Alternative baseline, NOT an executable migration instruction.
-- No extensions required. No existing table is altered or dropped.
BEGIN;
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
 CHECK(status <> 'Reviewed' OR (supplier_id IS NOT NULL AND length(trim(invoice_number))>0 AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL AND net IS NOT NULL AND vat IS NOT NULL AND gross IS NOT NULL AND net+vat=gross)),
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
COMMIT;

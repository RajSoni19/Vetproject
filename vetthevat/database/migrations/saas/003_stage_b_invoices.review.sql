-- REVIEW ONLY. Separate approval required. Never imported by application startup.
-- Additive Stage B business schema; approved Stage A migrations remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR NOT EXISTS(SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database() AND r.rolname='vtv_saas_database_owner' AND NOT(r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole))
 OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='saas' AND nspowner='vtv_saas_owner'::regrole)
 OR NOT EXISTS(SELECT 1 FROM saas.schema_version WHERE version=1)
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='saas' AND policyname='owner_authorization_lock'
     AND roles=ARRAY['vtv_saas_owner']::name[] AND with_check='false')<>2
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='business')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_document_worker')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unapproved target, missing Stage A or existing Stage B'; END IF;
END $$;
-- Password is not set by SQL. Dedicated local operator provisions a random
-- service secret after approval; worker has no direct table or auth access.
CREATE ROLE vtv_saas_document_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE vtv_saas_dev FROM vtv_saas_document_worker;
GRANT CONNECT ON DATABASE vtv_saas_dev TO vtv_saas_document_worker;
CREATE SCHEMA business AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA business REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA business REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE business.migrations(version integer PRIMARY KEY CHECK(version=3),installation_id uuid NOT NULL REFERENCES saas.schema_version(installation_id),created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO business.migrations(version,installation_id) SELECT 3,installation_id FROM saas.schema_version WHERE version=1;

-- Suppliers/customers share a normalized counterparty identity. A dual-role
-- business has two explicitly assigned records; no email-based ownership join.
CREATE TABLE business.counterparties(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 kind text NOT NULL CHECK(kind IN('supplier','customer')),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 email text CHECK(length(email)<=254),phone text CHECK(length(phone)<=50),vat_number text CHECK(length(vat_number)<=50),address text CHECK(length(address)<=2000),
 status text NOT NULL CHECK(status IN('active','archived')),version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id));
CREATE INDEX counterparties_lookup ON business.counterparties(company_id,kind,status,id);
CREATE TABLE business.contact_people(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,counterparty_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),email text CHECK(length(email)<=254),phone text CHECK(length(phone)<=50),
 FOREIGN KEY(company_id,counterparty_id) REFERENCES business.counterparties(company_id,id),UNIQUE(company_id,id));
CREATE TABLE business.tax_codes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),code text NOT NULL CHECK(length(code) BETWEEN 1 AND 40),
 treatment text NOT NULL CHECK(treatment IN('standard','reduced','zero','exempt','outside')),rate numeric(7,4) NOT NULL CHECK(rate BETWEEN 0 AND 100),
 effective_from date NOT NULL,effective_to date,CHECK(effective_to IS NULL OR effective_to>=effective_from),
 CHECK((treatment IN('standard','reduced') AND rate>0) OR (treatment IN('zero','exempt','outside') AND rate=0)),UNIQUE(company_id,id),UNIQUE(company_id,code,effective_from));
CREATE TABLE business.invoices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),contact_id uuid NOT NULL,
 direction text NOT NULL CHECK(direction IN('purchase','sale')),kind text NOT NULL CHECK(kind IN('invoice','credit-note')),
 number text NOT NULL CHECK(length(trim(number)) BETWEEN 1 AND 100),number_key text NOT NULL CHECK(length(number_key) BETWEEN 1 AND 100),
 issued_on date NOT NULL CHECK(issued_on BETWEEN '2000-01-01' AND '2199-12-31'),due_on date CHECK(due_on IS NULL OR due_on>=issued_on),
 currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),rounding text NOT NULL CHECK(rounding IN('line-half-up','tax-group-half-up')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','confirmed')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 credit_for_id uuid,notes text CHECK(length(notes)<=4000),contact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,calculation jsonb NOT NULL CHECK(jsonb_typeof(calculation)='object' AND octet_length(calculation::text)<=500000),
 net numeric(14,2) NOT NULL,vat numeric(14,2) NOT NULL,gross numeric(14,2) NOT NULL,CHECK(net+vat=gross),
 CHECK((kind='invoice' AND net>=0 AND vat>=0 AND gross>=0 AND credit_for_id IS NULL) OR (kind='credit-note' AND net<=0 AND vat<=0 AND gross<=0 AND credit_for_id IS NOT NULL)),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),confirmed_by uuid REFERENCES web_auth.users(id),confirmed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='draft' AND confirmed_by IS NULL AND confirmed_at IS NULL) OR (state='confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)),
 UNIQUE(company_id,id),FOREIGN KEY(company_id,contact_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,credit_for_id) REFERENCES business.invoices(company_id,id),CHECK(credit_for_id IS DISTINCT FROM id));
CREATE UNIQUE INDEX invoice_duplicate_identity ON business.invoices(company_id,direction,kind,contact_id,number_key);
CREATE INDEX invoices_listing ON business.invoices(company_id,state,direction,issued_on,id);
CREATE INDEX invoices_credit_origin ON business.invoices(company_id,credit_for_id) WHERE credit_for_id IS NOT NULL;
CREATE TABLE business.invoice_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,position integer NOT NULL CHECK(position BETWEEN 1 AND 500),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),quantity numeric(16,4) NOT NULL CHECK(quantity>0),unit_price numeric(16,4) NOT NULL CHECK(unit_price>=0),
 discount numeric(14,2) NOT NULL CHECK(discount>=0),rate numeric(7,4) NOT NULL CHECK(rate BETWEEN 0 AND 100),treatment text NOT NULL CHECK(treatment IN('standard','reduced','zero','exempt','outside')),
 pricing text NOT NULL CHECK(pricing IN('exclusive','inclusive')),net numeric(14,2) NOT NULL,vat numeric(14,2) NOT NULL,gross numeric(14,2) NOT NULL CHECK(net+vat=gross),
 CHECK((treatment IN('standard','reduced') AND rate>0) OR (treatment IN('zero','exempt','outside') AND rate=0)),
 UNIQUE(company_id,id),UNIQUE(company_id,invoice_id,id),UNIQUE(company_id,invoice_id,position),FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id));
CREATE TABLE business.invoice_revisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=1000000),actor_id uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),UNIQUE(company_id,invoice_id,version));
CREATE TABLE business.invoice_attachments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,document_id uuid NOT NULL,
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id),UNIQUE(company_id,invoice_id,document_id));
CREATE TABLE business.extraction_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid,document_id uuid NOT NULL,
 object_version text NOT NULL CHECK(length(object_version) BETWEEN 1 AND 1024),sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','completed','failed')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 lease_id uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),error_code text CHECK(error_code IN('TIMEOUT','UNAVAILABLE','INVALID_DOCUMENT','REVIEW_REQUIRED')),
 created_at timestamptz NOT NULL DEFAULT now(),CHECK((state='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id),
 UNIQUE(company_id,id),UNIQUE(company_id,document_id,object_version,sha256));
CREATE INDEX extraction_pending ON business.extraction_jobs(available_at,id) WHERE state IN('queued','processing');
CREATE TABLE business.extraction_results(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,job_id uuid NOT NULL,page integer NOT NULL CHECK(page BETWEEN 1 AND 100),
 observations jsonb NOT NULL CHECK(jsonb_typeof(observations)='object' AND octet_length(observations::text)<=200000),
 engine text NOT NULL CHECK(length(engine) BETWEEN 1 AND 100),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,job_id) REFERENCES business.extraction_jobs(company_id,id),UNIQUE(company_id,job_id,page));
CREATE TABLE business.review_issues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,code text NOT NULL CHECK(length(code) BETWEEN 1 AND 80),
 detail text NOT NULL CHECK(length(detail)<=1000),resolved_by uuid REFERENCES web_auth.users(id),resolved_at timestamptz,
 CHECK((resolved_at IS NULL)=(resolved_by IS NULL)),FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id));
CREATE TABLE business.vat_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),starts_on date NOT NULL,ends_on date NOT NULL,
 currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','closed')),
 CHECK(ends_on>=starts_on AND ends_on-starts_on<=366),UNIQUE(company_id,id),UNIQUE(company_id,starts_on,ends_on,currency));
CREATE TABLE business.vat_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,period_id uuid NOT NULL,invoice_id uuid,
 direction text NOT NULL CHECK(direction IN('input','output')),net numeric(14,2) NOT NULL,vat numeric(14,2) NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,period_id) REFERENCES business.vat_periods(company_id,id),FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id));
-- No runtime writes yet: banking allocation/reversal commands need separate tests.
CREATE TABLE business.payment_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 200),
 reversal_of uuid,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),UNIQUE(company_id,source_reference),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),FOREIGN KEY(company_id,reversal_of) REFERENCES business.payment_allocations(company_id,id));
CREATE TABLE business.command_keys(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),actor_id uuid NOT NULL REFERENCES web_auth.users(id),
 permission text NOT NULL REFERENCES saas.permissions(code),operation text NOT NULL CHECK(operation IN('contact.save','invoice.create','invoice.replace','invoice.confirm','invoice.attach')),
 key_hash char(64) NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),response jsonb,
 UNIQUE(company_id,actor_id,operation,key_hash));
CREATE TABLE business.invoice_usage(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,account_id uuid NOT NULL REFERENCES saas.billing_accounts(id),
 month date NOT NULL CHECK(extract(day FROM month)=1),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),UNIQUE(company_id,invoice_id));
CREATE INDEX account_invoice_usage ON business.invoice_usage(account_id,month);
-- Stable integration references only; no fabricated PO/receipt/stock/order rows.
CREATE TABLE business.source_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,invoice_id uuid NOT NULL,invoice_line_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('purchase-order-line','receipt-line','sales-order-line','return-line')),source_id uuid NOT NULL,
 quantity numeric(16,4) NOT NULL CHECK(quantity>0),value numeric(14,2) NOT NULL CHECK(value>=0),event_key text NOT NULL CHECK(length(event_key) BETWEEN 1 AND 128),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),FOREIGN KEY(company_id,invoice_id,invoice_line_id) REFERENCES business.invoice_lines(company_id,invoice_id,id),
 UNIQUE(company_id,event_key));

CREATE FUNCTION business.scope(target uuid,capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT current_setting('app.permission',true)=capability AND saas.authorized_company(target,capability);
$$;
CREATE FUNCTION business.invoice_visible(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT business.scope(target,'invoices:read') OR business.scope(target,'invoices:write') OR business.scope(target,'invoices:confirm') OR business.scope(target,'invoices:correct') OR business.scope(target,'reports:read') OR business.scope(target,'reports:export');
$$;
-- All new tenant tables FORCE RLS, with no PUBLIC or auth-runtime access.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['counterparties','contact_people','tax_codes','invoices','invoice_lines','invoice_revisions','invoice_attachments','extraction_jobs','extraction_results','review_issues','vat_periods','vat_adjustments','payment_allocations','command_keys','invoice_usage','source_links'] LOOP
  EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_lookup ON business.%I FOR SELECT TO vtv_saas_owner USING(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['counterparties','contact_people'] LOOP
  EXECUTE format('CREATE POLICY contact_read ON business.%I FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,''contacts:read''))',t);
  EXECUTE format('CREATE POLICY contact_insert ON business.%I FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,''contacts:write''))',t);
  EXECUTE format('CREATE POLICY contact_update ON business.%I FOR UPDATE TO vtv_saas_runtime USING(business.scope(company_id,''contacts:write'')) WITH CHECK(business.scope(company_id,''contacts:write''))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['invoices','invoice_lines','invoice_revisions','invoice_attachments','extraction_jobs','extraction_results','review_issues','payment_allocations','source_links'] LOOP
  EXECUTE format('CREATE POLICY invoice_read ON business.%I FOR SELECT TO vtv_saas_runtime USING(business.invoice_visible(company_id))',t);
 END LOOP;
END $$;
CREATE POLICY tax_read ON business.tax_codes FOR SELECT TO vtv_saas_runtime USING(business.invoice_visible(company_id));
CREATE POLICY invoice_create ON business.invoices FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND state='draft' AND ((kind='invoice' AND business.scope(company_id,'invoices:write')) OR (kind='credit-note' AND business.scope(company_id,'invoices:correct'))));
CREATE POLICY invoice_edit ON business.invoices FOR UPDATE TO vtv_saas_runtime USING(state='draft' AND (business.scope(company_id,'invoices:write') OR business.scope(company_id,'invoices:correct') OR business.scope(company_id,'invoices:confirm'))) WITH CHECK((state='draft' AND (business.scope(company_id,'invoices:write') OR business.scope(company_id,'invoices:correct'))) OR (state='confirmed' AND business.scope(company_id,'invoices:confirm')));
CREATE POLICY lines_insert ON business.invoice_lines FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,'invoices:write') OR business.scope(company_id,'invoices:correct'));
CREATE POLICY lines_delete ON business.invoice_lines FOR DELETE TO vtv_saas_runtime USING(business.scope(company_id,'invoices:write') OR business.scope(company_id,'invoices:correct'));
CREATE POLICY attachment_insert ON business.invoice_attachments FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,'invoices:write') AND saas.authorized_company(company_id,'documents:read'));
CREATE POLICY extraction_queue ON business.extraction_jobs FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,'invoices:write') AND saas.authorized_company(company_id,'documents:read') AND state='queued' AND attempts=0 AND lease_id IS NULL AND lease_until IS NULL);
CREATE POLICY extraction_document_read ON business.extraction_jobs FOR SELECT TO vtv_saas_runtime USING(business.scope(company_id,'documents:read'));
CREATE POLICY results_document_read ON business.extraction_results FOR SELECT TO vtv_saas_runtime USING(business.scope(company_id,'documents:read'));
CREATE POLICY keys_read ON business.command_keys FOR SELECT TO vtv_saas_runtime USING(actor_id=saas.current_actor() AND business.scope(company_id,permission));
CREATE POLICY keys_insert ON business.command_keys FOR INSERT TO vtv_saas_runtime WITH CHECK(actor_id=saas.current_actor() AND business.scope(company_id,permission) AND response IS NULL);
CREATE POLICY keys_update ON business.command_keys FOR UPDATE TO vtv_saas_runtime USING(actor_id=saas.current_actor() AND business.scope(company_id,permission)) WITH CHECK(actor_id=saas.current_actor() AND business.scope(company_id,permission));
CREATE POLICY period_read ON business.vat_periods FOR SELECT TO vtv_saas_runtime USING(business.scope(company_id,'reports:read') OR business.scope(company_id,'reports:export'));
CREATE POLICY adjustments_read ON business.vat_adjustments FOR SELECT TO vtv_saas_runtime USING(business.scope(company_id,'reports:read') OR business.scope(company_id,'reports:export'));
CREATE POLICY owner_revision_append ON business.invoice_revisions FOR INSERT TO vtv_saas_owner WITH CHECK(actor_id=saas.current_actor() AND business.invoice_visible(company_id));
CREATE POLICY owner_usage_append ON business.invoice_usage FOR INSERT TO vtv_saas_owner WITH CHECK(business.scope(company_id,'invoices:write') OR business.scope(company_id,'invoices:correct'));
CREATE POLICY owner_contact_lock ON business.counterparties FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
-- Row-lock visibility only, analogous to approved Stage A correction 002.
CREATE POLICY owner_entitlement_lock ON saas.subscription_entitlements FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);

CREATE FUNCTION business.check_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original business.invoices; party business.counterparties; amounts record;
BEGIN
 IF NOT business.scope(NEW.company_id,CASE WHEN NEW.state='confirmed' THEN 'invoices:confirm' WHEN NEW.kind='credit-note' THEN 'invoices:correct' ELSE 'invoices:write' END)
 THEN RAISE EXCEPTION 'Invoice capability required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text,832));
 IF TG_OP='UPDATE' THEN
  IF OLD.state='confirmed' OR NEW.company_id<>OLD.company_id OR NEW.id<>OLD.id OR NEW.created_by<>OLD.created_by
   OR NEW.kind<>OLD.kind OR NEW.credit_for_id IS DISTINCT FROM OLD.credit_for_id OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'Immutable invoice identity or invalid version'; END IF;
 END IF;
 SELECT * INTO party FROM business.counterparties WHERE company_id=NEW.company_id AND id=NEW.contact_id FOR SHARE;
 IF party.id IS NULL OR party.status<>'active' OR party.kind<>CASE WHEN NEW.direction='purchase' THEN 'supplier' ELSE 'customer' END
 THEN RAISE EXCEPTION 'Active matching tenant counterparty required'; END IF;
 IF NEW.state='draft' THEN NEW.contact_snapshot=to_jsonb(party)-ARRAY['company_id','created_at','updated_at'];END IF;
 IF NEW.kind='credit-note' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.credit_for_id::text,831));
  SELECT * INTO original FROM business.invoices WHERE company_id=NEW.company_id AND id=NEW.credit_for_id;
  IF original.id IS NULL OR original.kind<>'invoice' OR original.state<>'confirmed' OR original.contact_id<>NEW.contact_id OR original.direction<>NEW.direction OR original.currency<>NEW.currency
  THEN RAISE EXCEPTION 'Invalid credit origin'; END IF;
  IF -NEW.gross+coalesce((SELECT -sum(gross) FROM business.invoices WHERE company_id=NEW.company_id AND credit_for_id=NEW.credit_for_id AND id<>NEW.id AND state='confirmed'),0)>original.gross
   OR -NEW.net+coalesce((SELECT -sum(net) FROM business.invoices WHERE company_id=NEW.company_id AND credit_for_id=NEW.credit_for_id AND id<>NEW.id AND state='confirmed'),0)>original.net
   OR -NEW.vat+coalesce((SELECT -sum(vat) FROM business.invoices WHERE company_id=NEW.company_id AND credit_for_id=NEW.credit_for_id AND id<>NEW.id AND state='confirmed'),0)>original.vat
  THEN RAISE EXCEPTION 'Credit exceeds original invoice'; END IF;
 END IF;
 IF NEW.state='confirmed' THEN
  IF TG_OP<>'UPDATE' OR OLD.state<>'draft' OR NEW.confirmed_by IS DISTINCT FROM saas.current_actor() OR NOT business.scope(NEW.company_id,'invoices:confirm')
   OR (to_jsonb(NEW)-ARRAY['state','version','confirmed_by','confirmed_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','version','confirmed_by','confirmed_at','updated_at'])
  THEN RAISE EXCEPTION 'Explicit confirmation without financial edits required'; END IF;
  SELECT count(*) AS n,sum(net) AS net,sum(vat) AS vat,sum(gross) AS gross INTO amounts FROM business.invoice_lines WHERE company_id=NEW.company_id AND invoice_id=NEW.id;
  IF amounts.n NOT BETWEEN 1 AND 500 OR amounts.net<>NEW.net OR amounts.vat<>NEW.vat OR amounts.gross<>NEW.gross
   OR EXISTS(SELECT 1 FROM business.review_issues WHERE company_id=NEW.company_id AND invoice_id=NEW.id AND resolved_at IS NULL)
   OR EXISTS(SELECT 1 FROM business.invoice_attachments a JOIN saas.documents d ON d.company_id=a.company_id AND d.id=a.document_id WHERE a.company_id=NEW.company_id AND a.invoice_id=NEW.id AND (d.state<>'clean' OR NOT EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean')))
  THEN RAISE EXCEPTION 'Invoice lines, issues or clean originals require review'; END IF;
 END IF;
 NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER check_invoice BEFORE INSERT OR UPDATE ON business.invoices FOR EACH ROW EXECUTE FUNCTION business.check_invoice();
CREATE FUNCTION business.check_draft_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c uuid; i uuid; parent business.invoices; doc saas.documents;
BEGIN
 IF TG_OP='DELETE' THEN c=OLD.company_id;i=OLD.invoice_id;ELSE c=NEW.company_id;i=NEW.invoice_id;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i::text,832));
 SELECT * INTO parent FROM business.invoices WHERE company_id=c AND id=i;
 IF NOT (TG_TABLE_NAME='extraction_jobs' AND i IS NULL) AND (parent.id IS NULL OR parent.state<>'draft' OR NOT business.scope(c,CASE WHEN parent.kind='credit-note' THEN 'invoices:correct' ELSE 'invoices:write' END)) THEN RAISE EXCEPTION 'Writable draft required';END IF;
 IF TG_TABLE_NAME='extraction_jobs' AND i IS NULL AND session_user<>'vtv_saas_document_worker' AND NOT business.scope(c,'invoices:write') THEN RAISE EXCEPTION 'Extraction capability required';END IF;
 IF TG_TABLE_NAME='invoice_attachments' OR TG_TABLE_NAME='extraction_jobs' THEN
  SELECT * INTO doc FROM saas.documents WHERE company_id=c AND id=NEW.document_id;
  IF doc.id IS NULL OR (session_user<>'vtv_saas_document_worker' AND NOT saas.authorized_company(c,'documents:read')) THEN RAISE EXCEPTION 'Owned original required';END IF;
  IF TG_TABLE_NAME='extraction_jobs' AND (doc.state<>'clean' OR doc.object_version<>NEW.object_version OR doc.sha256<>NEW.sha256 OR NOT EXISTS(SELECT 1 FROM saas.document_inspections s WHERE s.company_id=c AND s.document_id=doc.id AND s.object_version=doc.object_version AND s.sha256=doc.sha256 AND s.verdict='clean')) THEN RAISE EXCEPTION 'Trusted matching inspection required';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER draft_line BEFORE INSERT OR DELETE ON business.invoice_lines FOR EACH ROW EXECUTE FUNCTION business.check_draft_child();
CREATE TRIGGER draft_attachment BEFORE INSERT ON business.invoice_attachments FOR EACH ROW EXECUTE FUNCTION business.check_draft_child();
CREATE TRIGGER clean_extraction BEFORE INSERT ON business.extraction_jobs FOR EACH ROW EXECUTE FUNCTION business.check_draft_child();
CREATE FUNCTION business.record_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO business.invoice_revisions(company_id,invoice_id,version,snapshot,actor_id)
 VALUES(NEW.company_id,NEW.id,NEW.version,to_jsonb(NEW),saas.current_actor());RETURN NEW;
END $$;
-- Calculation JSON retains ordered source lines and computed facts at every version.
CREATE TRIGGER invoice_revision AFTER INSERT OR UPDATE ON business.invoices FOR EACH ROW EXECUTE FUNCTION business.record_revision();
CREATE TRIGGER revision_immutable BEFORE UPDATE OR DELETE ON business.invoice_revisions FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER results_immutable BEFORE UPDATE OR DELETE ON business.extraction_results FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER adjustments_immutable BEFORE UPDATE OR DELETE ON business.vat_adjustments FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER allocations_immutable BEFORE UPDATE OR DELETE ON business.payment_allocations FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE FUNCTION business.consume_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; allowance integer; used bigint; month_start date;
BEGIN
 SELECT account_id INTO account FROM saas.company_profiles WHERE company_id=NEW.company_id;
 IF account IS NULL THEN RAISE EXCEPTION 'Billing account unavailable';END IF;
 -- Account-wide serialization avoids under-counting across its tenant companies.
 PERFORM pg_advisory_xact_lock(hashtextextended(account::text,833));
 SELECT invoices_per_month INTO allowance FROM saas.subscription_entitlements WHERE account_id=account AND status='active' AND verified_at IS NOT NULL AND source_reference IS NOT NULL FOR SHARE;
 IF allowance IS NULL THEN RAISE EXCEPTION 'Verified entitlement required';END IF;
 month_start=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 SELECT count(*) INTO used FROM business.invoice_usage WHERE account_id=account AND month=month_start;
 IF used>=allowance THEN RAISE EXCEPTION 'Account invoice allowance reached';END IF;
 INSERT INTO business.invoice_usage(company_id,invoice_id,account_id,month) VALUES(NEW.company_id,NEW.id,account,month_start);
 RETURN NEW;
END $$;
CREATE TRIGGER consume_quota AFTER INSERT ON business.invoices FOR EACH ROW EXECUTE FUNCTION business.consume_quota();

-- Worker-only, bounded leases. No browser/runtime can call these. Credentials
-- must be confined to the isolated scanner/OCR process, never Next.js.
CREATE POLICY owner_inspection_append ON saas.document_inspections FOR INSERT TO vtv_saas_owner WITH CHECK(true);
CREATE POLICY owner_inspection_jobs ON saas.document_jobs FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(kind='inspect');
CREATE POLICY owner_inspection_state ON saas.documents FOR UPDATE TO vtv_saas_owner USING(state='quarantined') WITH CHECK(state IN('quarantined','clean','rejected'));
CREATE POLICY owner_extraction_update ON business.extraction_jobs FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_extraction_results ON business.extraction_results FOR INSERT TO vtv_saas_owner WITH CHECK(true);
CREATE POLICY owner_extraction_queue ON business.extraction_jobs FOR INSERT TO vtv_saas_owner WITH CHECK(state='queued' AND attempts=0 AND lease_id IS NULL AND lease_until IS NULL);
CREATE FUNCTION business.claim_inspection() RETURNS TABLE(job_id uuid,lease_id uuid,company_id uuid,document_id uuid,object_key text,object_version text,sha256 text,byte_size bigint,mime_type text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j saas.document_jobs; d saas.documents; token uuid;
BEGIN
 UPDATE saas.document_jobs SET state='failed',lease_id=NULL,lease_until=NULL WHERE kind='inspect' AND state='processing' AND lease_until<now() AND attempts>=5;
 SELECT * INTO j FROM saas.document_jobs q WHERE q.kind='inspect' AND q.attempts<5 AND q.available_at<=now()
  AND (q.state='queued' OR (q.state='processing' AND q.lease_until<now())) ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN;END IF;
 SELECT * INTO d FROM saas.documents WHERE id=j.document_id AND saas.documents.company_id=j.company_id;
 IF d.state<>'quarantined' OR d.object_version IS NULL THEN RETURN;END IF;
 token=gen_random_uuid();
 UPDATE saas.document_jobs SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=j.id;
 RETURN QUERY SELECT j.id,token,d.company_id,d.id,d.object_key,d.object_version,d.sha256::text,d.byte_size,d.mime_type;
END $$;
CREATE FUNCTION business.finish_inspection(job uuid,lease uuid,verdict text,engine text,policy text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j saas.document_jobs; d saas.documents;
BEGIN
 IF verdict NOT IN('clean','infected','error') OR verdict IS NULL OR engine IS NULL OR policy IS NULL OR length(engine) NOT BETWEEN 1 AND 200 OR length(policy) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid scanner receipt';END IF;
 SELECT * INTO j FROM saas.document_jobs WHERE id=job AND kind='inspect' AND state='processing' AND lease_id=lease AND lease_until>now() FOR UPDATE;
 IF j.id IS NULL THEN RETURN false;END IF;
 SELECT * INTO d FROM saas.documents WHERE company_id=j.company_id AND id=j.document_id FOR UPDATE;
 IF d.state<>'quarantined' OR d.object_version IS NULL THEN RETURN false;END IF;
 INSERT INTO saas.document_inspections(company_id,document_id,object_version,sha256,verdict,scanner,policy_version) VALUES(d.company_id,d.id,d.object_version,d.sha256,verdict,engine,policy);
 UPDATE saas.documents SET state=CASE verdict WHEN 'clean' THEN 'clean' WHEN 'infected' THEN 'rejected' ELSE 'quarantined' END WHERE id=d.id;
 IF verdict='clean' THEN
  INSERT INTO business.extraction_jobs(company_id,invoice_id,document_id,object_version,sha256)
   VALUES(d.company_id,NULL,d.id,d.object_version,d.sha256) ON CONFLICT DO NOTHING;
 END IF;
 UPDATE saas.document_jobs SET state=CASE WHEN verdict='error' AND attempts<5 THEN 'queued' WHEN verdict='error' THEN 'failed' ELSE 'completed' END,
  lease_id=NULL,lease_until=NULL,available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)) WHERE id=j.id;
 RETURN true;
END $$;
CREATE FUNCTION business.claim_extraction() RETURNS TABLE(job_id uuid,lease_id uuid,company_id uuid,document_id uuid,object_key text,object_version text,sha256 text,byte_size bigint,mime_type text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j business.extraction_jobs; d saas.documents; token uuid;
BEGIN
 UPDATE business.extraction_jobs SET state='failed',error_code='TIMEOUT',lease_id=NULL,lease_until=NULL WHERE state='processing' AND lease_until<now() AND attempts>=5;
 SELECT * INTO j FROM business.extraction_jobs q WHERE q.attempts<5 AND q.available_at<=now() AND (q.state='queued' OR (q.state='processing' AND q.lease_until<now())) ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN;END IF;
 SELECT * INTO d FROM saas.documents WHERE saas.documents.company_id=j.company_id AND id=j.document_id;
 IF d.state<>'clean' OR d.object_version<>j.object_version OR d.sha256<>j.sha256 OR NOT EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean') THEN RETURN;END IF;
 token=gen_random_uuid();UPDATE business.extraction_jobs SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=j.id;
 RETURN QUERY SELECT j.id,token,d.company_id,d.id,d.object_key,d.object_version,d.sha256::text,d.byte_size,d.mime_type;
END $$;
CREATE FUNCTION business.finish_extraction(job uuid,lease uuid,pages jsonb,engine text,failure text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j business.extraction_jobs; d saas.documents; item jsonb; position integer=0;
BEGIN
 IF engine IS NULL OR length(engine) NOT BETWEEN 1 AND 100 OR (failure IS NOT NULL AND failure NOT IN('TIMEOUT','UNAVAILABLE','INVALID_DOCUMENT','REVIEW_REQUIRED')) THEN RAISE EXCEPTION 'Invalid extraction receipt';END IF;
 IF failure IS NULL AND (pages IS NULL OR jsonb_typeof(pages)<>'array' OR jsonb_array_length(pages) NOT BETWEEN 1 AND 20 OR octet_length(pages::text)>1000000) THEN RAISE EXCEPTION 'Invalid page results';END IF;
 SELECT * INTO j FROM business.extraction_jobs WHERE id=job AND state='processing' AND lease_id=lease AND lease_until>now() FOR UPDATE;
 IF j.id IS NULL THEN RETURN false;END IF;
 SELECT * INTO d FROM saas.documents WHERE company_id=j.company_id AND id=j.document_id;
 IF d.state<>'clean' OR d.object_version<>j.object_version OR d.sha256<>j.sha256 OR NOT EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean') THEN RETURN false;END IF;
 IF failure IS NULL THEN
  FOR item IN SELECT value FROM jsonb_array_elements(pages) LOOP
   position=position+1;INSERT INTO business.extraction_results(company_id,job_id,page,observations,engine) VALUES(j.company_id,j.id,position,item,engine);
  END LOOP;
 END IF;
 UPDATE business.extraction_jobs SET state=CASE WHEN failure IS NULL THEN 'completed' WHEN failure IN('TIMEOUT','UNAVAILABLE') AND attempts<5 THEN 'queued' ELSE 'failed' END,
  error_code=failure,lease_id=NULL,lease_until=NULL,available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer)) WHERE id=j.id;
 RETURN true;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA business FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA business FROM PUBLIC;
GRANT USAGE ON SCHEMA business TO vtv_saas_runtime;
GRANT SELECT ON business.migrations,business.counterparties,business.contact_people,business.tax_codes,business.invoices,business.invoice_lines,business.invoice_revisions,business.invoice_attachments,business.extraction_jobs,business.extraction_results,business.review_issues,business.vat_periods,business.vat_adjustments,business.payment_allocations,business.command_keys,business.source_links TO vtv_saas_runtime;
GRANT INSERT ON business.counterparties,business.contact_people,business.invoices,business.invoice_lines,business.invoice_attachments,business.extraction_jobs,business.command_keys TO vtv_saas_runtime;
GRANT UPDATE(name,email,phone,vat_number,address,status,version,updated_at) ON business.counterparties TO vtv_saas_runtime;
GRANT UPDATE(contact_id,direction,number,number_key,issued_on,due_on,currency,rounding,notes,calculation,net,vat,gross,state,version,confirmed_by,confirmed_at,updated_at) ON business.invoices TO vtv_saas_runtime;
GRANT UPDATE(response) ON business.command_keys TO vtv_saas_runtime;
GRANT DELETE ON business.invoice_lines TO vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION business.scope(uuid,text),business.invoice_visible(uuid) TO vtv_saas_runtime;
GRANT USAGE ON SCHEMA business TO vtv_saas_document_worker;
GRANT SELECT ON business.migrations TO vtv_saas_document_worker;
GRANT EXECUTE ON FUNCTION business.claim_inspection(),business.finish_inspection(uuid,uuid,text,text,text),business.claim_extraction(),business.finish_extraction(uuid,uuid,jsonb,text,text) TO vtv_saas_document_worker;
-- No billing activation, banking/ORS mutations, tax configuration/adjustment
-- writes or financial route activation is granted. Worker functions do not
-- accept company/object selectors: leases bind them to server-owned originals.
RESET ROLE;
COMMIT;

-- REVIEW ONLY. Prepared for a separate exact-checksum approval; never run by app startup.
-- Adds company-scoped statement imports, bank transactions, allocations and reconciliation history.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.command_keys') IS NULL OR to_regclass('business.invoices') IS NULL
 OR to_regclass('saas.audit_events') IS NULL OR to_regprocedure('business.scope(uuid,text)') IS NULL
 OR to_regprocedure('saas.authorized_company(uuid,text)') IS NULL
 OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='business'::regnamespace AND relname IN('bank_accounts','bank_imports','bank_transactions','bank_allocations','bank_reconciliation_events'))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check'
   AND pg_get_constraintdef(oid) LIKE '%operations.invoice.match%')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite or existing banking objects'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;

ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK(operation IN(
 'contact.save','invoice.create','invoice.replace','invoice.confirm','invoice.attach',
 'operations.material.create','operations.warehouse.create','operations.location.create',
 'operations.purchase-request.create','operations.purchase-request.approve','operations.purchase-request.reject',
 'operations.purchase-order.create','operations.goods-receipt.create','operations.stock.adjust',
 'operations.stock.transfer','operations.sales-order.create','operations.sales-order.transition','operations.invoice.match',
 'bank.account.create','bank.account.update','bank.statement.import','bank.transaction.categorize','bank.allocate','bank.allocation.reverse','bank.reconcile','bank.reconciliation.reverse'
));

CREATE TABLE business.bank_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),institution text CHECK(institution IS NULL OR length(institution)<=120),
 account_suffix char(4) CHECK(account_suffix IS NULL OR account_suffix ~ '^[0-9]{4}$'),currency text NOT NULL CHECK(currency IN('GBP','EUR','USD')),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','archived')),version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),updated_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id)
);
CREATE TABLE business.bank_imports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,account_id uuid NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),statement_start date NOT NULL,statement_end date NOT NULL CHECK(statement_end>=statement_start),
 opening_minor bigint NOT NULL CHECK(opening_minor BETWEEN -9007199254740991 AND 9007199254740991),
 closing_minor bigint NOT NULL CHECK(closing_minor BETWEEN -9007199254740991 AND 9007199254740991),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 10000),created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),UNIQUE(company_id,account_id,fingerprint),FOREIGN KEY(company_id,account_id) REFERENCES business.bank_accounts(company_id,id)
);
CREATE TABLE business.bank_transactions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,account_id uuid NOT NULL,import_id uuid NOT NULL,
 source_row integer NOT NULL CHECK(source_row BETWEEN 1 AND 10000),booked_on date NOT NULL,
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=200),description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 amount_minor bigint NOT NULL CHECK(amount_minor<>0 AND amount_minor BETWEEN -9007199254740991 AND 9007199254740991),
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 category text NOT NULL DEFAULT 'uncategorized' CHECK(category IN('uncategorized','supplier_payment','customer_receipt','fee','tax','transfer','refund','other')),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),
 UNIQUE(company_id,import_id,source_row),FOREIGN KEY(company_id,account_id) REFERENCES business.bank_accounts(company_id,id),
 FOREIGN KEY(company_id,import_id) REFERENCES business.bank_imports(company_id,id)
);
CREATE INDEX bank_transaction_listing ON business.bank_transactions(company_id,account_id,booked_on DESC,id);
CREATE INDEX bank_transaction_duplicate_review ON business.bank_transactions(company_id,account_id,fingerprint);
CREATE TABLE business.bank_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,transaction_id uuid NOT NULL,invoice_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=9007199254740991),
 action text NOT NULL CHECK(action IN('allocate','reverse')),reverses_id uuid,
 created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),
 CHECK((action='allocate' AND reverses_id IS NULL) OR (action='reverse' AND reverses_id IS NOT NULL)),
 FOREIGN KEY(company_id,transaction_id) REFERENCES business.bank_transactions(company_id,id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),
 FOREIGN KEY(company_id,reverses_id) REFERENCES business.bank_allocations(company_id,id),UNIQUE(company_id,reverses_id)
);
CREATE INDEX bank_allocation_transaction ON business.bank_allocations(company_id,transaction_id,created_at);
CREATE INDEX bank_allocation_invoice ON business.bank_allocations(company_id,invoice_id,created_at);
CREATE TABLE business.bank_transaction_categories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,transaction_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN('supplier_payment','customer_receipt','fee','tax','transfer','refund','other')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,transaction_id) REFERENCES business.bank_transactions(company_id,id),UNIQUE(company_id,id)
);
CREATE INDEX bank_category_history ON business.bank_transaction_categories(company_id,transaction_id,created_at DESC,id DESC);
CREATE TABLE business.bank_reconciliation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,transaction_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('reconcile','reverse')),reason text CHECK(reason IS NULL OR length(reason)<=1000),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,transaction_id) REFERENCES business.bank_transactions(company_id,id),UNIQUE(company_id,id)
);
CREATE INDEX bank_reconciliation_history ON business.bank_reconciliation_events(company_id,transaction_id,created_at DESC,id DESC);

CREATE FUNCTION business.validate_bank_account_write() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.updated_by<>saas.current_actor() THEN RAISE EXCEPTION 'Banking permission required';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by<>saas.current_actor() OR NEW.version<>1 THEN RAISE EXCEPTION 'Invalid bank account creator or version';END IF;
 ELSE
  IF OLD.company_id<>NEW.company_id OR OLD.id<>NEW.id OR OLD.created_by<>NEW.created_by OR OLD.currency<>NEW.currency OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Invalid bank account change';END IF;
  IF OLD.state='archived' AND NEW.state<>'archived' THEN RAISE EXCEPTION 'Archived account cannot be reactivated';END IF;
  IF OLD.state='active' AND NEW.state='archived' AND EXISTS(SELECT 1 FROM business.bank_transactions t WHERE t.company_id=OLD.company_id AND t.account_id=OLD.id) THEN
   IF EXISTS(SELECT 1 FROM business.bank_transactions t WHERE t.company_id=OLD.company_id AND t.account_id=OLD.id AND NOT EXISTS(SELECT 1 FROM business.bank_reconciliation_events e WHERE e.company_id=t.company_id AND e.transaction_id=t.id AND e.action='reconcile' AND NOT EXISTS(SELECT 1 FROM business.bank_reconciliation_events r WHERE r.company_id=e.company_id AND r.transaction_id=e.transaction_id AND r.created_at>=e.created_at AND r.action='reverse'))) THEN RAISE EXCEPTION 'Unreconciled transactions prevent archiving';END IF;
  END IF;
 END IF;NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER bank_account_write_guard BEFORE INSERT OR UPDATE ON business.bank_accounts FOR EACH ROW EXECUTE FUNCTION business.validate_bank_account_write();

CREATE FUNCTION business.validate_bank_import_row() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE account_state text;
BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.created_by<>saas.current_actor() THEN RAISE EXCEPTION 'Banking permission required';END IF;
 SELECT state INTO account_state FROM business.bank_accounts a WHERE a.company_id=NEW.company_id AND a.id=NEW.account_id FOR UPDATE;
 IF account_state IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Active company bank account required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_import_write_guard BEFORE INSERT ON business.bank_imports FOR EACH ROW EXECUTE FUNCTION business.validate_bank_import_row();
CREATE FUNCTION business.validate_bank_transaction_row() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE account_state text;account_id uuid;BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.created_by<>saas.current_actor() THEN RAISE EXCEPTION 'Banking permission required';END IF;
 SELECT a.state,i.account_id INTO account_state,account_id FROM business.bank_imports i JOIN business.bank_accounts a ON a.company_id=i.company_id AND a.id=i.account_id WHERE i.company_id=NEW.company_id AND i.id=NEW.import_id;
 IF account_state<>'active' OR account_id IS DISTINCT FROM NEW.account_id THEN RAISE EXCEPTION 'Bank import/account mismatch';END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_transaction_write_guard BEFORE INSERT ON business.bank_transactions FOR EACH ROW EXECUTE FUNCTION business.validate_bank_transaction_row();
CREATE FUNCTION business.validate_bank_import_totals() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE target_company uuid;target_import uuid;expected_count integer;expected_close bigint;expected_open bigint;actual_count bigint;actual_delta numeric;
BEGIN
 IF TG_TABLE_NAME='bank_imports' THEN target_company:=NEW.company_id;target_import:=NEW.id;ELSE target_company:=NEW.company_id;target_import:=NEW.import_id;END IF;
 SELECT row_count,closing_minor,opening_minor INTO expected_count,expected_close,expected_open FROM business.bank_imports WHERE company_id=target_company AND id=target_import;
 IF expected_count IS NULL THEN RAISE EXCEPTION 'Bank statement import is unavailable';END IF;
 SELECT count(*),coalesce(sum(amount_minor),0) INTO actual_count,actual_delta FROM business.bank_transactions WHERE company_id=target_company AND import_id=target_import;
 IF actual_count<>expected_count OR actual_delta+expected_open<>expected_close THEN RAISE EXCEPTION 'Statement rows do not reconcile to declared count and balances';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bank_import_nonempty_guard AFTER INSERT ON business.bank_imports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION business.validate_bank_import_totals();
CREATE CONSTRAINT TRIGGER bank_import_totals_guard AFTER INSERT ON business.bank_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION business.validate_bank_import_totals();

CREATE FUNCTION business.validate_bank_allocation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t business.bank_transactions; i business.invoices; original business.bank_allocations; bank_used bigint; invoice_used bigint; bank_total bigint;invoice_total bigint;sign_matches boolean;
BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.created_by<>saas.current_actor() THEN RAISE EXCEPTION 'Banking permission required';END IF;
 SELECT * INTO t FROM business.bank_transactions WHERE company_id=NEW.company_id AND id=NEW.transaction_id FOR UPDATE;
 SELECT * INTO i FROM business.invoices WHERE company_id=NEW.company_id AND id=NEW.invoice_id FOR UPDATE;
 IF t.id IS NULL OR i.id IS NULL OR i.state<>'confirmed' THEN RAISE EXCEPTION 'Confirmed company invoice required';END IF;
 sign_matches:=(t.amount_minor<0 AND i.direction='purchase') OR (t.amount_minor>0 AND i.direction='sale');
 IF NOT sign_matches OR (SELECT currency FROM business.bank_accounts WHERE company_id=NEW.company_id AND id=t.account_id)<>i.currency THEN RAISE EXCEPTION 'Invoice direction or currency mismatch';END IF;
 bank_total:=abs(t.amount_minor);invoice_total:=abs((i.gross*100)::bigint);
 IF NEW.action='allocate' THEN
  IF NEW.reverses_id IS NOT NULL THEN RAISE EXCEPTION 'Allocation cannot reverse another row';END IF;
  SELECT coalesce(sum(CASE WHEN action='allocate' THEN amount_minor ELSE -amount_minor END),0)::bigint INTO bank_used FROM business.bank_allocations WHERE company_id=NEW.company_id AND transaction_id=t.id;
  SELECT coalesce(sum(CASE WHEN action='allocate' THEN amount_minor ELSE -amount_minor END),0)::bigint INTO invoice_used FROM business.bank_allocations WHERE company_id=NEW.company_id AND invoice_id=i.id;
  IF bank_used+NEW.amount_minor>bank_total OR invoice_used+NEW.amount_minor>invoice_total THEN RAISE EXCEPTION 'Allocation exceeds remaining transaction or invoice balance';END IF;
 ELSE
  SELECT * INTO original FROM business.bank_allocations WHERE company_id=NEW.company_id AND id=NEW.reverses_id FOR UPDATE;
  IF original.id IS NULL OR original.action<>'allocate' OR original.transaction_id<>t.id OR original.invoice_id<>i.id OR original.amount_minor<>NEW.amount_minor THEN RAISE EXCEPTION 'Allocation reversal must match an active original allocation';END IF;
  IF EXISTS(SELECT 1 FROM business.bank_allocations WHERE company_id=NEW.company_id AND reverses_id=original.id) THEN RAISE EXCEPTION 'Allocation was already reversed';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_allocation_write_guard BEFORE INSERT ON business.bank_allocations FOR EACH ROW EXECUTE FUNCTION business.validate_bank_allocation();
CREATE FUNCTION business.validate_bank_category() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.created_by<>saas.current_actor()
 OR NOT EXISTS(SELECT 1 FROM business.bank_transactions t WHERE t.company_id=NEW.company_id AND t.id=NEW.transaction_id)
 THEN RAISE EXCEPTION 'Company bank transaction and banking permission required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_category_write_guard BEFORE INSERT ON business.bank_transaction_categories FOR EACH ROW EXECUTE FUNCTION business.validate_bank_category();
CREATE FUNCTION business.validate_bank_reconciliation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t business.bank_transactions; latest text; allocated bigint;BEGIN
 IF NOT business.scope(NEW.company_id,'banking:write') OR NEW.created_by<>saas.current_actor() THEN RAISE EXCEPTION 'Banking permission required';END IF;
 SELECT * INTO t FROM business.bank_transactions WHERE company_id=NEW.company_id AND id=NEW.transaction_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Company bank transaction required';END IF;
 SELECT action INTO latest FROM business.bank_reconciliation_events WHERE company_id=NEW.company_id AND transaction_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NEW.action='reconcile' THEN
  SELECT coalesce(sum(CASE WHEN action='allocate' THEN amount_minor ELSE -amount_minor END),0)::bigint INTO allocated FROM business.bank_allocations WHERE company_id=NEW.company_id AND transaction_id=t.id;
  IF latest='reconcile' OR allocated<>abs(t.amount_minor) THEN RAISE EXCEPTION 'Transaction must be fully allocated and unreconciled';END IF;
  IF EXISTS(SELECT 1 FROM business.bank_allocations a JOIN business.invoices i ON i.company_id=a.company_id AND i.id=a.invoice_id WHERE a.company_id=NEW.company_id AND a.transaction_id=t.id AND a.action='allocate' AND i.state<>'confirmed') THEN RAISE EXCEPTION 'All allocated invoices must be confirmed';END IF;
 ELSE IF latest IS DISTINCT FROM 'reconcile' OR length(trim(coalesce(NEW.reason,'')))<3 THEN RAISE EXCEPTION 'Reconciliation reversal reason and active reconciliation required';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER bank_reconciliation_write_guard BEFORE INSERT ON business.bank_reconciliation_events FOR EACH ROW EXECUTE FUNCTION business.validate_bank_reconciliation();
REVOKE ALL ON FUNCTION business.validate_bank_allocation(),business.validate_bank_reconciliation() FROM PUBLIC;

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['bank_accounts','bank_imports','bank_transactions','bank_allocations','bank_transaction_categories','bank_reconciliation_events'] LOOP
  EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_bank_read ON business.%I FOR SELECT TO vtv_saas_owner USING(true)',t);
  EXECUTE format('CREATE POLICY bank_company_read ON business.%I FOR SELECT TO vtv_saas_runtime USING(business.scope(company_id,''banking:read'') OR business.scope(company_id,''banking:write''))',t);
 END LOOP;
END $$;
CREATE POLICY bank_account_insert ON business.bank_accounts FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND updated_by=saas.current_actor() AND version=1 AND business.scope(company_id,'banking:write'));
CREATE POLICY bank_account_update ON business.bank_accounts FOR UPDATE TO vtv_saas_runtime USING(business.scope(company_id,'banking:write')) WITH CHECK(business.scope(company_id,'banking:write'));
CREATE POLICY bank_import_insert ON business.bank_imports FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND business.scope(company_id,'banking:write'));
CREATE POLICY bank_transaction_insert ON business.bank_transactions FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND business.scope(company_id,'banking:write'));
CREATE POLICY bank_allocation_insert ON business.bank_allocations FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND business.scope(company_id,'banking:write'));
CREATE POLICY bank_category_insert ON business.bank_transaction_categories FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND business.scope(company_id,'banking:write'));
CREATE POLICY bank_reconciliation_insert ON business.bank_reconciliation_events FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND business.scope(company_id,'banking:write'));
GRANT SELECT,INSERT ON business.bank_accounts,business.bank_imports,business.bank_transactions,business.bank_allocations,business.bank_transaction_categories,business.bank_reconciliation_events TO vtv_saas_runtime;
GRANT UPDATE(name,institution,account_suffix,state,version,updated_by,updated_at) ON business.bank_accounts TO vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION business.validate_bank_account_write(),business.validate_bank_import_row(),business.validate_bank_transaction_row(),business.validate_bank_import_totals(),business.validate_bank_allocation(),business.validate_bank_category(),business.validate_bank_reconciliation() TO vtv_saas_runtime;
CREATE TRIGGER bank_import_immutable BEFORE UPDATE OR DELETE ON business.bank_imports FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER bank_transaction_immutable BEFORE UPDATE OR DELETE ON business.bank_transactions FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER bank_allocation_immutable BEFORE UPDATE OR DELETE ON business.bank_allocations FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER bank_category_immutable BEFORE UPDATE OR DELETE ON business.bank_transaction_categories FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER bank_reconciliation_immutable BEFORE UPDATE OR DELETE ON business.bank_reconciliation_events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
COMMIT;

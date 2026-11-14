-- REVIEW ONLY: exact-file approval required. Never executed by application startup.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.materials') IS NULL OR to_regclass('operations.supplier_invoice_reviews') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved supplier invoice migration target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
-- Register new commands without removing any existing VAT/ORS vocabulary.
DO $$ DECLARE original_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check';
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format('ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation IN (%L,%L))',original_expression,'ors.supplier-invoice.review','ors.supplier-product.mapping');
END $$;
CREATE TABLE operations.supplier_invoice_reviews(
 company_id uuid NOT NULL,document_id uuid NOT NULL,supplier_id uuid NOT NULL,purchase_order_id uuid,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload->'lines')='array' AND jsonb_array_length(payload->'lines') BETWEEN 1 AND 500),
 source jsonb NOT NULL,acknowledgements jsonb NOT NULL,issues jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('draft','confirmed')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,document_id),
 FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,purchase_order_id) REFERENCES operations.purchase_orders(company_id,id)
);
CREATE UNIQUE INDEX supplier_invoice_identity ON operations.supplier_invoice_reviews(company_id,supplier_id,lower(btrim(payload->>'invoiceNumber'))) WHERE state='confirmed';
CREATE TABLE operations.supplier_product_mappings(
 company_id uuid NOT NULL,supplier_id uuid NOT NULL,supplier_code text NOT NULL,material_id uuid NOT NULL,
 PRIMARY KEY(company_id,supplier_id,supplier_code),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id)
);
CREATE TABLE operations.supplier_invoice_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,document_id uuid NOT NULL,
 version bigint NOT NULL,snapshot jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,document_id) REFERENCES operations.supplier_invoice_reviews(company_id,document_id),UNIQUE(company_id,document_id,version)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['supplier_invoice_reviews','supplier_product_mappings','supplier_invoice_review_events'] LOOP
 EXECUTE format('ALTER TABLE operations.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE operations.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_all ON operations.%I FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true)',t);
 EXECUTE format('CREATE POLICY supplier_read ON operations.%I FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,''procurement:read''))',t);
 END LOOP; END $$;
CREATE POLICY supplier_insert ON operations.supplier_invoice_reviews FOR INSERT TO vtv_saas_runtime WITH CHECK(saas.authorized_company(company_id,'procurement:write'));
CREATE POLICY supplier_update ON operations.supplier_invoice_reviews FOR UPDATE TO vtv_saas_runtime USING(saas.authorized_company(company_id,'procurement:write')) WITH CHECK(saas.authorized_company(company_id,'procurement:write'));
CREATE POLICY supplier_mapping_insert ON operations.supplier_product_mappings FOR INSERT TO vtv_saas_runtime WITH CHECK(saas.authorized_company(company_id,'procurement:write'));
-- Reuse immutable OCR observations; no worker or storage provider coupling.
CREATE POLICY ors_extraction_read ON business.extraction_results FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'procurement:read') AND saas.authorized_company(company_id,'documents:read'));
CREATE POLICY ors_extraction_jobs_read ON business.extraction_jobs FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'procurement:read') AND saas.authorized_company(company_id,'documents:read'));
CREATE FUNCTION operations.guard_supplier_invoice_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT saas.authorized_company(NEW.company_id,'procurement:write') OR NOT saas.authorized_company(NEW.company_id,'documents:read') OR NEW.updated_by IS DISTINCT FROM saas.current_actor() THEN RAISE EXCEPTION 'Supplier invoice authorization required'; END IF;
 IF TG_OP='UPDATE' AND (OLD.state='confirmed' OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.source IS DISTINCT FROM OLD.source OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'Immutable confirmed invoice, source or version conflict'; END IF;
 IF TG_OP='INSERT' AND NEW.version<>1 THEN RAISE EXCEPTION 'Initial version required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.documents d JOIN saas.document_inspections i ON i.company_id=d.company_id AND i.document_id=d.id AND i.sha256=d.sha256 AND i.object_version=d.object_version AND i.verdict='clean' WHERE d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.state='clean') THEN RAISE EXCEPTION 'Clean original required'; END IF;
 IF NEW.state='confirmed' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(NEW.issues) issue WHERE NOT NEW.acknowledgements ? issue) THEN RAISE EXCEPTION 'Discrepancy acknowledgement required'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION operations.record_supplier_invoice_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO operations.supplier_invoice_review_events(company_id,document_id,version,snapshot,actor_id) VALUES(NEW.company_id,NEW.document_id,NEW.version,to_jsonb(NEW),saas.current_actor()); RETURN NEW;
END $$;
CREATE TRIGGER guard_supplier_invoice_review BEFORE INSERT OR UPDATE ON operations.supplier_invoice_reviews FOR EACH ROW EXECUTE FUNCTION operations.guard_supplier_invoice_review();
CREATE TRIGGER record_supplier_invoice_review AFTER INSERT OR UPDATE ON operations.supplier_invoice_reviews FOR EACH ROW EXECUTE FUNCTION operations.record_supplier_invoice_review();
CREATE TRIGGER immutable_supplier_invoice_events BEFORE UPDATE OR DELETE ON operations.supplier_invoice_review_events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
REVOKE ALL ON operations.supplier_invoice_reviews,operations.supplier_product_mappings,operations.supplier_invoice_review_events FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT SELECT ON operations.supplier_invoice_reviews,operations.supplier_product_mappings,operations.supplier_invoice_review_events TO vtv_saas_runtime;
GRANT INSERT,UPDATE ON operations.supplier_invoice_reviews TO vtv_saas_runtime;
GRANT INSERT ON operations.supplier_product_mappings TO vtv_saas_runtime;
REVOKE ALL ON FUNCTION operations.guard_supplier_invoice_review(),operations.record_supplier_invoice_review() FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
RESET ROLE;
COMMIT;

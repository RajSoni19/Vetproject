-- REVIEW ONLY. Adds company-scoped manual payment entries and human-reviewed
-- VAT evidence. Never run by application startup; explicit owner approval is required.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database() !~ '^(vtv_saas_dev|vtv_uat_[0-9]{14}_[a-f0-9]{8})$'
 OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.invoices') IS NULL
 OR to_regclass('business.invoice_lines') IS NULL
 OR to_regclass('business.command_keys') IS NULL
 OR to_regclass('saas.audit_events') IS NULL
 OR to_regprocedure('business.scope(uuid,text)') IS NULL
 OR to_regprocedure('business.invoice_visible(uuid)') IS NULL
 OR to_regprocedure('saas.current_actor()') IS NULL
 OR to_regprocedure('saas.reject_immutable_change()') IS NULL
 OR to_regclass('business.invoice_payments') IS NOT NULL
 OR to_regclass('business.invoice_payment_events') IS NOT NULL
 OR to_regclass('business.invoice_tax_reviews') IS NOT NULL
 OR to_regclass('business.invoice_tax_review_events') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolsuper OR rolbypassrls OR rolcanlogin))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite or existing payment/tax-review objects'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;

ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK(operation IN(
 'contact.save','invoice.create','invoice.replace','invoice.confirm','invoice.attach',
 'operations.material.create','operations.warehouse.create','operations.location.create',
 'operations.purchase-request.create','operations.purchase-request.approve','operations.purchase-request.reject',
 'operations.purchase-order.create','operations.goods-receipt.create','operations.stock.adjust',
 'operations.stock.transfer','operations.sales-order.create','operations.sales-order.transition','operations.invoice.match',
 'bank.account.create','bank.account.update','bank.statement.import','bank.transaction.categorize','bank.allocate',
 'bank.allocation.reverse','bank.reconcile','bank.reconciliation.reverse','document.purpose',
 'ors.shopping.cart.add','ors.shopping.cart.update','ors.shopping.cart.remove','ors.shopping.requisition.assign',
 'ors.shopping.requisition.transition','ors.shopping.line.reconcile','ors.shopping.catalogue.configure',
 'ors.shopping.catalogue.unit','ors.shopping.catalogue.supplier','document.processing.retry',
 'ors.shopping.offer.configure','ors.shopping.whatsapp.configure','ors.shopping.checkout','invoice.delete',
 'ors.supplier-invoice.review','ors.supplier-product.mapping','invoice.payment.record',
 'invoice.payment.update','invoice.tax-review.save'));

CREATE TABLE business.invoice_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 invoice_id uuid NOT NULL,
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 method text NOT NULL CHECK(method IN('card','bank-transfer','cash','other')),
 paid_on date NOT NULL,
 transaction_reference text CHECK(transaction_reference IS NULL OR length(transaction_reference)<=200),
 notes text CHECK(notes IS NULL OR length(notes)<=2000),
 evidence_verified boolean NOT NULL DEFAULT false,
 recording_type text NOT NULL DEFAULT 'manual' CHECK(recording_type='manual'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id)
);
CREATE INDEX invoice_payments_company_invoice_date ON business.invoice_payments(company_id,invoice_id,paid_on,id);

CREATE TABLE business.invoice_tax_reviews(
 company_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 detected_vat numeric(14,2) CHECK(detected_vat IS NULL OR detected_vat>=0),
 detection_status text NOT NULL DEFAULT 'not-evidenced' CHECK(detection_status IN('detected','not-evidenced')),
 evidenced_vat numeric(14,2) CHECK(evidenced_vat IS NULL OR evidenced_vat>=0),
 evidence_reference text CHECK(evidence_reference IS NULL OR length(evidence_reference)<=500),
 evidence_verified boolean NOT NULL DEFAULT false,
 claim_status text NOT NULL DEFAULT 'review-required' CHECK(claim_status IN('review-required','eligible','ineligible')),
 tax_treatment text NOT NULL DEFAULT 'unknown' CHECK(tax_treatment IN('unknown','standard','zero-rated','exempt','outside-scope','mixed','inclusive')),
 accounting_scheme text NOT NULL DEFAULT 'invoice' CHECK(accounting_scheme IN('invoice','cash')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 reviewed_by uuid REFERENCES web_auth.users(id),
 reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,invoice_id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id),
 CHECK((detection_status='detected')=(detected_vat IS NOT NULL)),
 CHECK(NOT evidence_verified OR (evidenced_vat IS NOT NULL AND evidence_reference IS NOT NULL)),
 CHECK(claim_status<>'eligible' OR (evidence_verified AND evidenced_vat IS NOT NULL AND tax_treatment NOT IN('unknown','zero-rated','exempt','outside-scope')))
);

CREATE TABLE business.invoice_payment_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 payment_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('recorded','updated')),
 previous_value jsonb CHECK(previous_value IS NULL OR octet_length(previous_value::text)<=16000),
 current_value jsonb NOT NULL CHECK(octet_length(current_value::text)<=16000),
 actor_id uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id)
);
CREATE INDEX invoice_payment_events_invoice_date ON business.invoice_payment_events(company_id,invoice_id,created_at,id);

CREATE TABLE business.invoice_tax_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 invoice_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('created','reviewed','revised')),
 previous_value jsonb CHECK(previous_value IS NULL OR octet_length(previous_value::text)<=16000),
 current_value jsonb NOT NULL CHECK(octet_length(current_value::text)<=16000),
 actor_id uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id)
);
CREATE INDEX invoice_tax_review_events_invoice_date ON business.invoice_tax_review_events(company_id,invoice_id,created_at,id);

CREATE FUNCTION business.record_invoice_payment_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_value jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  old_value=jsonb_build_object('amount',OLD.amount,'method',OLD.method,'paidOn',OLD.paid_on,
   'transactionReference',OLD.transaction_reference,'notes',OLD.notes,'evidenceVerified',OLD.evidence_verified,'version',OLD.version);
 END IF;
 INSERT INTO business.invoice_payment_events(company_id,invoice_id,payment_id,action,previous_value,current_value,actor_id)
 VALUES(NEW.company_id,NEW.invoice_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'recorded' ELSE 'updated' END,old_value,
  jsonb_build_object('amount',NEW.amount,'method',NEW.method,'paidOn',NEW.paid_on,
   'transactionReference',NEW.transaction_reference,'notes',NEW.notes,'evidenceVerified',NEW.evidence_verified,
   'recordingType',NEW.recording_type,'version',NEW.version),saas.current_actor());
 RETURN NEW;
END $$;

CREATE FUNCTION business.record_invoice_tax_review_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old_value jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  old_value=jsonb_build_object('detectedVat',OLD.detected_vat,'detectionStatus',OLD.detection_status,
   'evidencedVat',OLD.evidenced_vat,'evidenceReference',OLD.evidence_reference,'evidenceVerified',OLD.evidence_verified,
   'claimStatus',OLD.claim_status,'taxTreatment',OLD.tax_treatment,'accountingScheme',OLD.accounting_scheme,'version',OLD.version);
 END IF;
 INSERT INTO business.invoice_tax_review_events(company_id,invoice_id,action,previous_value,current_value,actor_id)
 VALUES(NEW.company_id,NEW.invoice_id,CASE WHEN TG_OP='INSERT' THEN 'created'
  WHEN NEW.claim_status='review-required' THEN 'revised' ELSE 'reviewed' END,old_value,
  jsonb_build_object('detectedVat',NEW.detected_vat,'detectionStatus',NEW.detection_status,
   'evidencedVat',NEW.evidenced_vat,'evidenceReference',NEW.evidence_reference,'evidenceVerified',NEW.evidence_verified,
   'claimStatus',NEW.claim_status,'taxTreatment',NEW.tax_treatment,'accountingScheme',NEW.accounting_scheme,'version',NEW.version),
  saas.current_actor());
 RETURN NEW;
END $$;

CREATE TRIGGER invoice_payment_event AFTER INSERT OR UPDATE ON business.invoice_payments
 FOR EACH ROW EXECUTE FUNCTION business.record_invoice_payment_event();
CREATE TRIGGER invoice_tax_review_event AFTER INSERT OR UPDATE ON business.invoice_tax_reviews
 FOR EACH ROW EXECUTE FUNCTION business.record_invoice_tax_review_event();
CREATE TRIGGER invoice_payment_events_immutable BEFORE UPDATE OR DELETE ON business.invoice_payment_events
 FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
CREATE TRIGGER invoice_tax_review_events_immutable BEFORE UPDATE OR DELETE ON business.invoice_tax_review_events
 FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();

DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['invoice_payments','invoice_tax_reviews','invoice_payment_events','invoice_tax_review_events'] LOOP
  EXECUTE format('ALTER TABLE business.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('ALTER TABLE business.%I FORCE ROW LEVEL SECURITY',item);
  EXECUTE format('CREATE POLICY owner_invoice_review_all ON business.%I FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true)',item);
 END LOOP;
END $$;
CREATE POLICY invoice_payments_read ON business.invoice_payments FOR SELECT TO vtv_saas_runtime
 USING(business.invoice_visible(company_id));
CREATE POLICY invoice_payments_insert ON business.invoice_payments FOR INSERT TO vtv_saas_runtime
 WITH CHECK(created_by=saas.current_actor() AND updated_by=saas.current_actor() AND version=1
  AND recording_type='manual' AND business.scope(company_id,'invoices:write'));
CREATE POLICY invoice_payments_update ON business.invoice_payments FOR UPDATE TO vtv_saas_runtime
 USING(business.scope(company_id,'invoices:write'))
 WITH CHECK(updated_by=saas.current_actor() AND version>1 AND recording_type='manual'
  AND business.scope(company_id,'invoices:write'));
CREATE POLICY invoice_tax_reviews_read ON business.invoice_tax_reviews FOR SELECT TO vtv_saas_runtime
 USING(business.invoice_visible(company_id));
CREATE POLICY invoice_tax_reviews_insert ON business.invoice_tax_reviews FOR INSERT TO vtv_saas_runtime
 WITH CHECK(reviewed_by=saas.current_actor() AND version=1 AND business.scope(company_id,'invoices:write'));
CREATE POLICY invoice_tax_reviews_update ON business.invoice_tax_reviews FOR UPDATE TO vtv_saas_runtime
 USING(business.scope(company_id,'invoices:write'))
 WITH CHECK(reviewed_by=saas.current_actor() AND version>1 AND business.scope(company_id,'invoices:write'));
CREATE POLICY invoice_payment_events_read ON business.invoice_payment_events FOR SELECT TO vtv_saas_runtime
 USING(business.scope(company_id,'audit:read'));
CREATE POLICY invoice_tax_review_events_read ON business.invoice_tax_review_events FOR SELECT TO vtv_saas_runtime
 USING(business.scope(company_id,'audit:read'));

GRANT SELECT,INSERT,UPDATE ON business.invoice_payments,business.invoice_tax_reviews TO vtv_saas_runtime;
GRANT SELECT ON business.invoice_payment_events,business.invoice_tax_review_events TO vtv_saas_runtime;
GRANT INSERT ON business.invoice_payment_events,business.invoice_tax_review_events TO vtv_saas_owner;
GRANT EXECUTE ON FUNCTION business.record_invoice_payment_event(),business.record_invoice_tax_review_event() TO vtv_saas_runtime;
COMMIT;

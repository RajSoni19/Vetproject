-- REVIEW ONLY. Separates missing VAT evidence from zero-rated/exempt treatments.
-- Requires migration 045; never run by application startup.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database() !~ '^(vtv_saas_dev|vtv_uat_[0-9]{14}_[a-f0-9]{8})$'
 OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.invoice_lines') IS NULL
 OR to_regclass('business.invoice_payments') IS NULL
 OR to_regclass('business.invoice_tax_reviews') IS NULL
 OR to_regclass('business.invoice_tax_review_events') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.invoice_lines'::regclass AND conname='invoice_lines_treatment_check')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.invoice_lines'::regclass AND conname='invoice_lines_check1')
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.invoice_lines'::regclass AND pg_get_constraintdef(oid) LIKE '%not-evidenced%')
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='business.invoice_tax_reviews'::regclass AND polname='invoice_tax_reviews_insert')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolsuper OR rolbypassrls OR rolcanlogin))
 THEN RAISE EXCEPTION 'Unapproved target, migration 045 prerequisite missing, or invoice constraints already changed'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;

ALTER TABLE business.invoice_lines
 DROP CONSTRAINT invoice_lines_treatment_check,
 DROP CONSTRAINT invoice_lines_check1;
ALTER TABLE business.invoice_lines
 ADD CONSTRAINT invoice_lines_treatment_check
  CHECK(treatment IN('standard','reduced','zero','exempt','outside','not-evidenced')),
 ADD CONSTRAINT invoice_lines_check1 CHECK(
  (treatment IN('standard','reduced') AND rate>0)
  OR (treatment IN('zero','exempt','outside','not-evidenced') AND rate=0)
 );

DROP POLICY invoice_tax_reviews_insert ON business.invoice_tax_reviews;
CREATE POLICY invoice_tax_reviews_insert ON business.invoice_tax_reviews FOR INSERT TO vtv_saas_runtime
 WITH CHECK(business.scope(company_id,'invoices:write') AND version=1 AND
  ((reviewed_by=saas.current_actor() AND reviewed_at IS NOT NULL)
   OR (reviewed_by IS NULL AND reviewed_at IS NULL AND detection_status IN('detected','not-evidenced')
    AND evidence_verified=false AND evidenced_vat IS NULL AND evidence_reference IS NULL
    AND claim_status='review-required' AND tax_treatment='unknown')));
COMMIT;

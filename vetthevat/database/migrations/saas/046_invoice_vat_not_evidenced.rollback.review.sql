-- REVIEW ONLY. Refuses rollback while any line uses the not-evidenced treatment.
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
 OR to_regclass('business.invoice_tax_reviews') IS NULL
 OR EXISTS(SELECT 1 FROM business.invoice_lines WHERE treatment='not-evidenced')
 THEN RAISE EXCEPTION 'Rollback blocked: unapproved target, missing objects, or not-evidenced invoice lines exist'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;

ALTER TABLE business.invoice_lines
 DROP CONSTRAINT invoice_lines_treatment_check,
 DROP CONSTRAINT invoice_lines_check1;
ALTER TABLE business.invoice_lines
 ADD CONSTRAINT invoice_lines_treatment_check
  CHECK(treatment IN('standard','reduced','zero','exempt','outside')),
 ADD CONSTRAINT invoice_lines_check1 CHECK(
  (treatment IN('standard','reduced') AND rate>0)
  OR (treatment IN('zero','exempt','outside') AND rate=0)
 );

DROP POLICY invoice_tax_reviews_insert ON business.invoice_tax_reviews;
CREATE POLICY invoice_tax_reviews_insert ON business.invoice_tax_reviews FOR INSERT TO vtv_saas_runtime
 WITH CHECK(reviewed_by=saas.current_actor() AND version=1 AND business.scope(company_id,'invoices:write'));
COMMIT;

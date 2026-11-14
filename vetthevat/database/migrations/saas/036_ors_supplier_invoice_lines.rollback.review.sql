-- REVIEW ONLY. Approval required; disable SAAS_ORS_SUPPLIER_INVOICES_ENABLED first.
-- Refuses rollback when review/audit/mapping data exists. Export and retain those
-- records before preparing a separate approved data-preserving rollback.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 THEN RAISE EXCEPTION 'Unapproved supplier invoice rollback target'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
LOCK TABLE operations.supplier_invoice_reviews,operations.supplier_invoice_review_events,operations.supplier_product_mappings IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM operations.supplier_invoice_reviews) OR EXISTS(SELECT 1 FROM operations.supplier_invoice_review_events) OR EXISTS(SELECT 1 FROM operations.supplier_product_mappings)
 THEN RAISE EXCEPTION 'Data exists; export and prepare a separately approved data-preserving rollback'; END IF;
END $$;
DROP POLICY ors_extraction_read ON business.extraction_results;
DROP POLICY ors_extraction_jobs_read ON business.extraction_jobs;
DROP TABLE operations.supplier_invoice_review_events;
DROP TABLE operations.supplier_invoice_reviews;
DROP TABLE operations.supplier_product_mappings;
DROP FUNCTION operations.guard_supplier_invoice_review();
DROP FUNCTION operations.record_supplier_invoice_review();
RESET ROLE;
COMMIT;

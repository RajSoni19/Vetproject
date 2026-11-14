-- REVIEW ONLY. Stop local document consumers before separately approving rollback.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 THEN RAISE EXCEPTION 'Unapproved local worker rollback target'; END IF;
 IF EXISTS(SELECT 1 FROM saas.document_jobs WHERE state='processing' AND lease_until>now())
 OR EXISTS(SELECT 1 FROM business.extraction_jobs WHERE state='processing' AND lease_until>now())
 THEN RAISE EXCEPTION 'Active document leases; stop workers and wait for leases before rollback'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP FUNCTION business.claim_local_inspection();
DROP FUNCTION business.claim_local_extraction();
DROP FUNCTION business.retry_local_document(uuid,uuid);
DROP TABLE business.local_document_scope;
RESET ROLE;
COMMIT;

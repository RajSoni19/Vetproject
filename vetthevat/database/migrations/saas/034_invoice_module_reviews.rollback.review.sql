-- REVIEW ONLY. Stop application consumers before separately approving rollback.
-- Refuses rollback once any review state or audit history exists.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('invoice_routing.purposes') IS NULL
 OR to_regclass('invoice_routing.module_reviews') IS NULL
 OR to_regclass('invoice_routing.module_review_events') IS NULL
 OR to_regprocedure('invoice_routing.guard_module_review()') IS NULL
 OR to_regprocedure('invoice_routing.record_module_review()') IS NULL
 OR to_regprocedure('invoice_routing.sync_module_reviews()') IS NULL
 THEN RAISE EXCEPTION 'Unapproved module-review rollback target/state'; END IF;
 IF EXISTS(SELECT 1 FROM invoice_routing.module_reviews)
 OR EXISTS(SELECT 1 FROM invoice_routing.module_review_events)
 THEN RAISE EXCEPTION 'Module-review data exists; preserve records and prepare a separately reviewed data migration'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='invoice_routing.purposes'::regclass AND tgname='sync_module_reviews' AND NOT tgisinternal)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='invoice_routing.module_reviews'::regclass AND tgname='guard_module_review' AND NOT tgisinternal)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='invoice_routing.module_reviews'::regclass AND tgname='record_module_review' AND NOT tgisinternal)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='invoice_routing.module_review_events'::regclass AND tgname='immutable_module_review_events' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Expected migration-owned triggers are missing; inspect dependencies before rollback'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP TRIGGER sync_module_reviews ON invoice_routing.purposes;
DROP TRIGGER immutable_module_review_events ON invoice_routing.module_review_events;
DROP TRIGGER record_module_review ON invoice_routing.module_reviews;
DROP TRIGGER guard_module_review ON invoice_routing.module_reviews;
DROP FUNCTION invoice_routing.sync_module_reviews();
DROP FUNCTION invoice_routing.record_module_review();
DROP FUNCTION invoice_routing.guard_module_review();
DROP TABLE invoice_routing.module_review_events;
DROP TABLE invoice_routing.module_reviews;
RESET ROLE;
COMMIT;

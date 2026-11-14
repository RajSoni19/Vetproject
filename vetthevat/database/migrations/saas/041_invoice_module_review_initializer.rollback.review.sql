-- REVIEW ONLY. Removes initializer support only; review rows/events are never deleted.
-- Once initialization has inserted review state, rollback is forward-only and must preserve it.
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
 OR to_regprocedure('invoice_routing.module_review_initializer_scope(uuid,text)') IS NULL
 OR to_regprocedure('invoice_routing.initialize_module_reviews(uuid,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='invoice_routing' AND tablename='purposes'
   AND policyname='module_review_initializer_purposes' AND cmd='SELECT'
   AND roles=ARRAY['vtv_saas_owner']::name[] AND qual LIKE '%module_review_initializer_scope%')
 THEN RAISE EXCEPTION 'Unapproved module-review initializer rollback target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP POLICY module_review_initializer_purposes ON invoice_routing.purposes;
DROP FUNCTION invoice_routing.initialize_module_reviews(uuid,text);
DROP FUNCTION invoice_routing.module_review_initializer_scope(uuid,text);
RESET ROLE;
COMMIT;

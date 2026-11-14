-- REVIEW ONLY. Restores EXECUTE for the RLS predicate required by migration 006.
-- No row, role, policy, table, schema or financial record changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.materials') IS NULL
 OR has_function_privilege('vtv_saas_runtime','operations.allowed(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or existing function privilege'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
GRANT EXECUTE ON FUNCTION operations.allowed(uuid,text) TO vtv_saas_runtime;
COMMIT;

-- REVIEW ONLY. Non-destructive containment, not a schema/data downgrade.
-- First disable PLATFORM_ADMIN_ENABLED and roll back only the application.
-- Keep RLS, contract gates, snapshots, quotas and immutable audit/billing history.
-- Removing the new entitlement column/constraint would invalidate custom plans;
-- such a forward repair requires its own reviewed migration and approval.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR to_regnamespace('platform_admin') IS NULL THEN RAISE EXCEPTION 'Unapproved containment target';END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA platform_admin FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform_admin FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
RESET ROLE;
COMMIT;

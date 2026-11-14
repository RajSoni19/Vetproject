-- REVIEW ONLY. Lets the banking owner trigger lock the original immutable allocation.
-- This policy grants no runtime access and blocks owner UPDATE writes with WITH CHECK(false).
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.bank_allocations') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='business.bank_allocations'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='vtv_saas_owner'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND policyname='owner_bank_allocation_lock')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND policyname='owner_bank_transaction_lock' AND tablename='bank_transactions' AND roles=ARRAY['vtv_saas_owner']::name[] AND cmd='UPDATE' AND qual='true' AND with_check='false')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND tablename='bank_allocations' AND policyname='owner_bank_read' AND roles=ARRAY['vtv_saas_owner']::name[] AND cmd='SELECT')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unexpected target, RLS state, table owner, existing policy or runtime role'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE POLICY owner_bank_allocation_lock ON business.bank_allocations FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
COMMIT;

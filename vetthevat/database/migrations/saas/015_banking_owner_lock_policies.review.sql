-- REVIEW ONLY. Adds lock-only owner policies required by banking SECURITY DEFINER triggers.
-- No runtime role gains UPDATE access; WITH CHECK(false) prevents owner writes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.bank_transactions') IS NULL OR to_regclass('business.invoices') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='business.bank_transactions'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='vtv_saas_owner'::regrole)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='business.invoices'::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='vtv_saas_owner'::regrole)
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND policyname IN('owner_bank_transaction_lock','owner_invoice_lock'))
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND tablename='bank_transactions' AND policyname='owner_bank_read' AND roles=ARRAY['vtv_saas_owner']::name[] AND cmd='SELECT')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='business' AND tablename='invoices' AND policyname='owner_lookup' AND roles=ARRAY['vtv_saas_owner']::name[] AND cmd='SELECT')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unexpected target, RLS state, table owner, existing policy or runtime role'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE POLICY owner_bank_transaction_lock ON business.bank_transactions FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
CREATE POLICY owner_invoice_lock ON business.invoices FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
COMMIT;

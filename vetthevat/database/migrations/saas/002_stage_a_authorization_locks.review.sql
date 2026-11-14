-- CORRECTIVE STAGE A ONLY. Requires separate approval; never run automatically.
-- Original 001 remains unchanged at its approved SHA-256.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR inet_server_port()<>55440
 OR host(inet_server_addr())<>'127.0.0.1' OR session_user<>'vtv_saas_operator'
 OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR NOT EXISTS(SELECT 1 FROM saas.schema_version WHERE version=1)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.company_profiles'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.billing_accounts'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'Refusing unapproved target or security configuration'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='saas' AND policyname='owner_authorization_lock')
 THEN RAISE EXCEPTION 'Corrective migration already applied; refusing repeat'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
-- SELECT ... FOR SHARE applies the UPDATE USING policy even when no row is
-- modified. Only the trusted NOLOGIN function owner receives this visibility.
-- WITH CHECK(false) rejects actual UPDATE writes through these policies.
CREATE POLICY owner_authorization_lock ON saas.company_profiles
 FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
CREATE POLICY owner_authorization_lock ON saas.billing_accounts
 FOR UPDATE TO vtv_saas_owner USING(true) WITH CHECK(false);
RESET ROLE;
COMMIT;

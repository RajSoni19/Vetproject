-- Shared include. Run one of the six entry scripts, not this file directly.
\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off
\if :{?expected_role}
\else
  \echo STOP: expected_role must be supplied for administrator entry scripts.
  SELECT 1/0 AS stop_missing_expected_role;
\endif
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS effective_role,
       session_user AS login_role, current_setting('server_version') AS server_version,
       inet_server_addr() AS server_address, inet_server_port() AS server_port,
       inet_client_addr() AS client_address,
       current_setting('transaction_read_only') AS transaction_read_only;
SELECT coalesce(current_database() = :'expected_database'
       AND current_user = :'expected_role' AND session_user = :'expected_role'
       AND inet_server_addr() = '127.0.0.1'::inet AND inet_server_port() = 5432
       AND inet_client_addr() = '127.0.0.1'::inet
       AND current_setting('server_version_num')::integer = 170011
       AND current_setting('transaction_read_only') = 'on'
       AND (:'audit_kind' <> 'administrator' OR
            EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND rolsuper)),false)
       AS audit_target_ok \gset
-- A deliberate arithmetic error on false plus ON_ERROR_STOP terminates the
-- entire include chain. Do not use \quit inside an include (it only ends it).
SELECT 1 / (:'audit_target_ok'::boolean::integer) AS target_guard;
\echo PASS: session target and read-only transaction guard.
SELECT CASE WHEN system_user IS NULL THEN NULL ELSE pg_catalog.split_part(system_user,':',1) END
       AS reported_authentication_method;
SELECT ssl,version AS tls_version,cipher AS tls_cipher
FROM pg_catalog.pg_stat_ssl WHERE pid=pg_catalog.pg_backend_pid();
-- Read-only transaction is a second safeguard, not permission to add arbitrary
-- SELECT calls. All following SQL is allowlisted catalog/inquiry inspection.

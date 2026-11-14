-- Shared ADMINISTRATOR-ONLY catalog/control inspection. No authentication hashes,
-- HBA option values, role setting values, routine bodies or client records output.
\echo A01: Cluster identity; administrator-only, never attempted as runtime
SELECT system_identifier::text,pg_control_version,catalog_version_no
FROM pg_catalog.pg_control_system();
\echo A02: Non-secret server authentication/network configuration
SELECT name,setting FROM pg_catalog.pg_settings
WHERE name IN ('listen_addresses','port','ssl','password_encryption') ORDER BY name;
\echo A03: Ordered HBA rules; sensitive option VALUES and parse error TEXT omitted
SELECT rule_number,file_name,line_number,type,database,user_name,address,netmask,auth_method,
       coalesce(cardinality(options),0) AS option_count,error IS NOT NULL AS has_parse_error
FROM pg_catalog.pg_hba_file_rules ORDER BY rule_number NULLS LAST,file_name,line_number;
-- pg_hba_file_rules reports current file contents, not proof of last-loaded rules.
-- Match by first applicable ordered rule, including group membership and SSL mode.
-- Any has_parse_error=true is a STOP; inspect locally without publishing option values.
\echo A04: Runtime ownership of non-relation objects and schemas (expected zero rows)
SELECT 'schema' AS object_type,n.nspname AS schema_name,n.nspname AS object_name,
       pg_catalog.pg_get_userbyid(n.nspowner) AS owner
FROM pg_catalog.pg_namespace n
WHERE pg_catalog.pg_get_userbyid(n.nspowner) IN ('vetthevat_dev_runtime','vetthevat_test_runtime')
UNION ALL
SELECT 'routine',n.nspname,p.proname,pg_catalog.pg_get_userbyid(p.proowner)
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE pg_catalog.pg_get_userbyid(p.proowner) IN ('vetthevat_dev_runtime','vetthevat_test_runtime')
UNION ALL
SELECT 'type',n.nspname,t.typname,pg_catalog.pg_get_userbyid(t.typowner)
FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
WHERE pg_catalog.pg_get_userbyid(t.typowner) IN ('vetthevat_dev_runtime','vetthevat_test_runtime');

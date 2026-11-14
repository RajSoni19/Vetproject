-- Shared read-only catalog audit. No application rows or secret catalogs read.
\echo C01: Expected database existence and ownership
WITH expected(database_name,owner_name) AS (VALUES
 ('vetthevat_dev','vetthevat_dev_owner'),('vetthevat_test','vetthevat_test_owner'))
SELECT e.*, d.oid IS NOT NULL AS database_exists, pg_catalog.pg_get_userbyid(d.datdba) AS actual_owner,
       pg_catalog.pg_get_userbyid(d.datdba)=e.owner_name AS owner_matches,
       d.datallowconn, d.datistemplate, d.datconnlimit
FROM expected e LEFT JOIN pg_catalog.pg_database d ON d.datname=e.database_name;

\echo C02: All six role attributes; missing roles remain visible
WITH expected(role_name) AS (VALUES ('vetthevat_dev_owner'),('vetthevat_dev_migrator'),
 ('vetthevat_dev_runtime'),('vetthevat_test_owner'),('vetthevat_test_migrator'),('vetthevat_test_runtime'))
SELECT e.role_name,r.oid IS NOT NULL AS role_exists,r.rolcanlogin,r.rolsuper,r.rolcreatedb,
       r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit,r.rolconnlimit
FROM expected e LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.role_name ORDER BY e.role_name;

\echo C03: Direct memberships and grant options involving project roles
SELECT mbr.rolname AS member, parent.rolname AS granted_role,
       a.admin_option,a.inherit_option,a.set_option,pg_catalog.pg_get_userbyid(a.grantor) AS grantor
FROM pg_catalog.pg_auth_members a
JOIN pg_catalog.pg_roles mbr ON mbr.oid=a.member
JOIN pg_catalog.pg_roles parent ON parent.oid=a.roleid
WHERE mbr.rolname IN ('vetthevat_dev_owner','vetthevat_dev_migrator','vetthevat_dev_runtime',
 'vetthevat_test_owner','vetthevat_test_migrator','vetthevat_test_runtime')
 OR parent.rolname IN ('vetthevat_dev_owner','vetthevat_dev_migrator','vetthevat_dev_runtime',
 'vetthevat_test_owner','vetthevat_test_migrator','vetthevat_test_runtime')
ORDER BY member,granted_role;

\echo C04: Effective direct or indirect memberships, excluding self
SELECT r.rolname AS member,p.rolname AS reachable_role,
       pg_catalog.pg_has_role(r.oid,p.oid,'MEMBER') AS member_of,
       pg_catalog.pg_has_role(r.oid,p.oid,'USAGE') AS inherited_now,
       pg_catalog.pg_has_role(r.oid,p.oid,'SET') AS can_set_role,
       pg_catalog.pg_has_role(r.oid,p.oid,'MEMBER WITH ADMIN OPTION') AS can_administer
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_roles p
WHERE r.rolname IN ('vetthevat_dev_owner','vetthevat_dev_migrator','vetthevat_dev_runtime',
 'vetthevat_test_owner','vetthevat_test_migrator','vetthevat_test_runtime') AND r.oid<>p.oid
 AND (pg_catalog.pg_has_role(r.oid,p.oid,'MEMBER') OR pg_catalog.pg_has_role(r.oid,p.oid,'SET')
      OR pg_catalog.pg_has_role(r.oid,p.oid,'USAGE')) ORDER BY member,reachable_role;

\echo C05: Effective database privileges for all six roles against both environments
SELECT r.rolname,d.datname,
       pg_catalog.has_database_privilege(r.oid,d.oid,'CONNECT') AS can_connect,
       pg_catalog.has_database_privilege(r.oid,d.oid,'CREATE') AS can_create,
       pg_catalog.has_database_privilege(r.oid,d.oid,'TEMPORARY') AS can_temp,
       pg_catalog.has_database_privilege(r.oid,d.oid,'CONNECT WITH GRANT OPTION') AS can_grant_connect
FROM pg_catalog.pg_roles r CROSS JOIN pg_catalog.pg_database d
WHERE r.rolname IN ('vetthevat_dev_owner','vetthevat_dev_migrator','vetthevat_dev_runtime',
 'vetthevat_test_owner','vetthevat_test_migrator','vetthevat_test_runtime')
 AND d.datname IN ('vetthevat_dev','vetthevat_test') ORDER BY r.rolname,d.datname;

\echo C06: Expanded database ACLs including PUBLIC and null-ACL defaults
SELECT d.datname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       pg_catalog.pg_get_userbyid(a.grantor) AS grantor,a.privilege_type,a.is_grantable
FROM pg_catalog.pg_database d CROSS JOIN LATERAL
 pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
WHERE d.datname IN ('vetthevat_dev','vetthevat_test') ORDER BY d.datname,grantee,a.privilege_type;

\echo C07: Local schema ownership and effective privileges for current login and both runtimes
SELECT n.nspname,pg_catalog.pg_get_userbyid(n.nspowner) AS owner,r.rolname,
       pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE') AS can_use,
       pg_catalog.has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create
FROM pg_catalog.pg_namespace n CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 AND (r.rolname=current_user OR r.rolname IN ('vetthevat_dev_runtime','vetthevat_test_runtime'))
ORDER BY n.nspname,r.rolname;
SELECT n.nspname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL
 pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' ORDER BY n.nspname,grantee;

\echo C08: Non-system relations and effective table/column privileges; no relation contents
SELECT n.nspname,c.relname,c.relkind,pg_catalog.pg_get_userbyid(c.relowner) AS owner,
 c.relrowsecurity,c.relforcerowsecurity,r.rolname,
 pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT') AS table_select,
 pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT') AS any_column_select,
 pg_catalog.has_any_column_privilege(r.oid,c.oid,'INSERT') AS any_column_insert,
 pg_catalog.has_any_column_privilege(r.oid,c.oid,'UPDATE') AS any_column_update,
 pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE') AS can_delete,
 pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE') AS can_truncate,
 pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES') AS can_reference,
 pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER') AS can_trigger,
 pg_catalog.has_table_privilege(r.oid,c.oid,'MAINTAIN') AS can_maintain,
 (pg_catalog.has_any_column_privilege(r.oid,c.oid,'SELECT WITH GRANT OPTION')
 OR pg_catalog.has_any_column_privilege(r.oid,c.oid,'INSERT WITH GRANT OPTION')
 OR pg_catalog.has_any_column_privilege(r.oid,c.oid,'UPDATE WITH GRANT OPTION')
 OR pg_catalog.has_any_column_privilege(r.oid,c.oid,'REFERENCES WITH GRANT OPTION')
 OR pg_catalog.has_table_privilege(r.oid,c.oid,'DELETE WITH GRANT OPTION')
 OR pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE WITH GRANT OPTION')
 OR pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER WITH GRANT OPTION')
 OR pg_catalog.has_table_privilege(r.oid,c.oid,'MAINTAIN WITH GRANT OPTION')) AS any_grant_option,
 CASE WHEN c.relkind='v' THEN coalesce(c.reloptions @> ARRAY['security_invoker=true'],false) END AS view_security_invoker
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r','p','v','m','f')
 AND (r.rolname=current_user OR r.rolname IN ('vetthevat_dev_runtime','vetthevat_test_runtime'))
ORDER BY n.nspname,c.relname,r.rolname;

\echo C09: Sequence privileges (USAGE and UPDATE can advance a sequence; not exercised)
SELECT n.nspname,c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner,r.rolname,
 pg_catalog.has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
 pg_catalog.has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
 pg_catalog.has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN pg_catalog.pg_roles r WHERE c.relkind='S' AND n.nspname !~ '^pg_'
 AND n.nspname<>'information_schema'
 AND (r.rolname=current_user OR r.rolname IN ('vetthevat_dev_runtime','vetthevat_test_runtime'))
ORDER BY n.nspname,c.relname,r.rolname;

\echo C10: User routine ownership and EXECUTE exposure; do not invoke routines
SELECT n.nspname,p.proname,p.oid,p.prokind,pg_catalog.pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef AS security_definer,r.rolname,
 pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute,
 EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
 EXISTS(SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%') AS has_fixed_search_path
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 AND (r.rolname=current_user OR r.rolname IN ('vetthevat_dev_runtime','vetthevat_test_runtime'))
ORDER BY n.nspname,p.proname,p.oid,r.rolname;

\echo C11: Type ownership and USAGE (includes table row types and arrays)
SELECT n.nspname,t.typname,pg_catalog.pg_get_userbyid(t.typowner) AS owner,r.rolname,
 pg_catalog.has_type_privilege(r.oid,t.oid,'USAGE') AS can_use
FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 AND (r.rolname=current_user OR r.rolname IN ('vetthevat_dev_runtime','vetthevat_test_runtime'))
ORDER BY n.nspname,t.typname,r.rolname;

\echo C12: Global effective creation defaults; includes built-in defaults when no catalog entry exists
SELECT r.rolname AS creator,k.object_kind,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_roles r
CROSS JOIN (VALUES ('r'::"char",'table'),('S'::"char",'sequence'),('f'::"char",'function'),('T'::"char",'type')) k(code,object_kind)
LEFT JOIN pg_catalog.pg_default_acl d ON d.defaclrole=r.oid AND d.defaclnamespace=0 AND d.defaclobjtype=k.code
CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.defaclacl,pg_catalog.acldefault(
 CASE WHEN k.code='S' THEN 's'::"char" ELSE k.code END,r.oid))) a
WHERE r.rolname IN ('vetthevat_dev_owner','vetthevat_dev_migrator','vetthevat_test_owner','vetthevat_test_migrator')
ORDER BY creator,k.object_kind,grantee;
\echo C13: Stored default-ACL entries; schema entries ADD to global defaults
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator,
       CASE WHEN d.defaclnamespace=0 THEN '(global)' ELSE n.nspname END AS schema_name,d.defaclobjtype,
       CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type,a.is_grantable
FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
LEFT JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a ON true
ORDER BY creator,schema_name,d.defaclobjtype,grantee;

\echo C14: Policy metadata only; no policy expressions or application data printed
SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
 ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id)::text END
       FROM unnest(p.polroles) role_id) AS policy_roles
FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' ORDER BY n.nspname,c.relname,p.polname;

\echo C15: Current non-secret session settings; no tenant context is assigned
SELECT current_setting('search_path') AS search_path,current_setting('row_security') AS row_security;

\echo C16: PUBLIC relation and column ACLs (including built-in null-ACL defaults)
SELECT n.nspname,c.relname,'(table/sequence)'::text AS column_name,a.privilege_type,a.is_grantable
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(c.relacl,
 pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 AND c.relkind IN ('r','p','v','m','f','S') AND a.grantee=0
UNION ALL
SELECT n.nspname,c.relname,att.attname::text,a.privilege_type,a.is_grantable
FROM pg_catalog.pg_attribute att JOIN pg_catalog.pg_class c ON c.oid=att.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(att.attacl) a
WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'
 AND att.attnum>0 AND NOT att.attisdropped AND a.grantee=0
ORDER BY 1,2,3,4;

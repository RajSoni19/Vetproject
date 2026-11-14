-- Shared read-only migrator include. Permission inquiries do NOT assume the role.
\echo M01: Explicit owner assumption permission; expected MEMBER and SET true, ADMIN false
SELECT current_user AS migrator,r.rolname AS owner_role,
       pg_catalog.pg_has_role(current_user,r.oid,'MEMBER') AS owner_membership,
       pg_catalog.pg_has_role(current_user,r.oid,'SET') AS can_explicitly_assume_owner,
       pg_catalog.pg_has_role(current_user,r.oid,'USAGE') AS owner_privileges_inherited_now,
       pg_catalog.pg_has_role(current_user,r.oid,'MEMBER WITH ADMIN OPTION') AS can_administer_owner
FROM pg_catalog.pg_roles r WHERE r.rolname=:'expected_owner';
\echo M02: Desired migration owner exists and owns the database; no SET ROLE executed
SELECT d.datname,r.rolname AS database_owner,NOT r.rolcanlogin AS owner_is_nologin,
       d.datdba = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname=:'expected_owner') AS expected_owner
FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba
WHERE d.datname=current_database();

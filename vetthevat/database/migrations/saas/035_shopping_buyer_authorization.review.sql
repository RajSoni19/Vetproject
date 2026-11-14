-- REVIEW ONLY. Requires separate exact-file approval before execution.
-- Adds narrowly scoped, owner-executed lookup helpers instead of granting the
-- business runtime direct reads from private web_auth identity tables.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.shopping_requisitions') IS NULL
 OR to_regclass('web_auth.company_memberships') IS NULL OR to_regclass('web_auth.users') IS NULL
 OR NOT has_table_privilege('vtv_saas_owner','web_auth.company_memberships','SELECT')
 OR NOT has_column_privilege('vtv_saas_owner','web_auth.users','full_name','SELECT')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_provider_runtime')
 OR to_regprocedure('operations.shopping_buyers(uuid)') IS NOT NULL
 OR to_regprocedure('operations.shopping_assignment_manager(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved shopping buyer authorization target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE FUNCTION operations.shopping_buyers(p_company uuid)
RETURNS TABLE(id uuid,name text,role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,web_auth,saas AS $$
BEGIN
 IF p_company IS DISTINCT FROM NULLIF(current_setting('app.company_id',true),'')::uuid
 OR NOT saas.authorized_company(p_company,'procurement:read')
 THEN RAISE EXCEPTION 'Authorized company purchasing access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT m.user_id,u.full_name,m.role
 FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id
 JOIN saas.company_roles r ON r.code=m.role
 JOIN saas.role_permissions rp ON rp.role_id=r.id
 JOIN saas.permissions p ON p.id=rp.permission_id AND p.code='procurement:write'
 WHERE m.company_id=p_company AND m.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY u.full_name,m.user_id LIMIT 200;
END $$;
CREATE FUNCTION operations.shopping_assignment_manager(p_company uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,web_auth,saas AS $$
 SELECT p_company::text=current_setting('app.company_id',true)
 AND saas.authorized_company(p_company,'procurement:write')
 AND EXISTS(SELECT 1 FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id
  WHERE m.company_id=p_company AND m.user_id=saas.current_actor() AND m.status='active'
   AND u.status='active' AND u.email_verified_at IS NOT NULL AND m.role IN('Owner','Admin','Procurement'))
$$;
REVOKE ALL ON FUNCTION operations.shopping_buyers(uuid),operations.shopping_assignment_manager(uuid) FROM PUBLIC,vtv_web_runtime,vtv_saas_provider_runtime;
GRANT EXECUTE ON FUNCTION operations.shopping_buyers(uuid),operations.shopping_assignment_manager(uuid) TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

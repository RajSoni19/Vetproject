-- REVIEW ONLY. Adds the narrowly scoped draft requisition rejection transition.
-- Does not change tables, RLS policies, roles, grants, stock or existing records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.purchase_requests') IS NULL
 OR to_regprocedure('operations.reject_purchase_request(uuid,uuid,bigint,uuid)') IS NOT NULL
 OR NOT has_function_privilege('vtv_saas_runtime','operations.allowed(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or existing rejection function'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE FUNCTION operations.reject_purchase_request(p_company uuid,p_request uuid,p_expected_version bigint,p_actor uuid)
RETURNS TABLE(id uuid,version bigint,state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE result_id uuid;result_version bigint;result_state text;
BEGIN
 IF NOT saas.authorized_company(p_company,'procurement:approve') OR p_actor IS DISTINCT FROM saas.current_actor() THEN
  RAISE EXCEPTION 'Unauthorized purchase request rejection';
 END IF;
 UPDATE operations.purchase_requests AS pr
 SET state='cancelled',version=pr.version+1
 WHERE pr.company_id=p_company AND pr.id=p_request AND pr.state='draft' AND pr.version=p_expected_version
 RETURNING pr.id,pr.version,pr.state INTO result_id,result_version,result_state;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid purchase request rejection transition'; END IF;
 id:=result_id;version:=result_version;state:=result_state;RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION operations.reject_purchase_request(uuid,uuid,bigint,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations.reject_purchase_request(uuid,uuid,bigint,uuid) TO vtv_saas_runtime;
COMMIT;

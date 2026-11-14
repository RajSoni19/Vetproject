-- REVIEW ONLY. Separate approval required; correction to accepted migration 022.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regprocedure('support_desk.authorize(text,uuid)') IS NULL OR to_regprocedure('web_auth.lock_support_admin(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'Unapproved support correction target';END IF;
END $$;
-- The auth owner already owns these tables. Expose a boolean live-grant lock,
-- rather than granting UPDATE on the role tables to either login runtime.
SET LOCAL ROLE vtv_web_owner;
CREATE FUNCTION web_auth.lock_support_admin(p_actor uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=p_actor AND r.name='software_administrator' FOR SHARE OF ur,r;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION web_auth.lock_support_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web_auth.lock_support_admin(uuid) TO vtv_saas_owner;
RESET ROLE;
SET LOCAL ROLE vtv_saas_owner;
CREATE OR REPLACE FUNCTION support_desk.authorize(p_hash text,p_company uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;BEGIN
 actor=saas.team_identity(p_hash);
 IF web_auth.lock_support_admin(actor) THEN RETURN actor;END IF;
 IF p_company IS NOT NULL THEN
  PERFORM 1 FROM web_auth.company_memberships WHERE user_id=actor AND company_id=p_company AND status='active' FOR SHARE;
  IF FOUND THEN RETURN actor;END IF;
 END IF;
 RAISE EXCEPTION 'Support permission required' USING ERRCODE='42501';
END $$;
-- Explicit administrator-only scope: team_identity validates and locks the session.
GRANT EXECUTE ON FUNCTION support_desk.authorize(text,uuid) TO vtv_web_runtime;
RESET ROLE;
COMMIT;

-- REVIEW ONLY. No account-profile changes are enabled until this migration is
-- separately approved and applied to the isolated development database.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('web_auth.users') IS NULL
 OR to_regclass('web_auth.sessions') IS NULL
 OR to_regclass('web_auth.audit_logs') IS NULL
 OR to_regprocedure('web_auth.update_profile(text,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite, or profile function already exists'; END IF;
END $$;

SET LOCAL ROLE vtv_web_owner;
CREATE FUNCTION web_auth.update_profile(session_hash text,new_full_name text)
RETURNS TABLE(full_name text,email text,email_verified_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior_name text;
BEGIN
 IF session_hash !~ '^[a-f0-9]{64}$'
 OR new_full_name IS NULL
 OR new_full_name<>btrim(regexp_replace(new_full_name,'\s+',' ','g'))
 OR length(new_full_name)<1 OR length(new_full_name)>120
 OR new_full_name ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid profile update'; END IF;
 SELECT s.user_id,u.full_name INTO actor,prior_name
 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.status='active' AND u.email_verified_at IS NOT NULL FOR UPDATE OF s,u;
 IF actor IS NULL THEN RAISE EXCEPTION 'Active verified session required'; END IF;
 UPDATE web_auth.users u SET full_name=new_full_name
 WHERE u.id=actor AND u.status='active'
 RETURNING u.full_name,u.email,u.email_verified_at INTO full_name,email,email_verified_at;
 IF full_name IS NULL THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF prior_name IS DISTINCT FROM full_name THEN
  INSERT INTO web_auth.audit_logs(actor_user_id,action,metadata)
  VALUES(actor,'auth.profile.updated',jsonb_build_object('field','full_name'));
 END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION web_auth.update_profile(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web_auth.update_profile(text,text) TO vtv_web_runtime;
COMMIT;

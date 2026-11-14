-- SEPARATE APPROVAL REQUIRED. Not imported by migration, build or startup.
-- Set vtv.reviewed_admin_user to the explicitly approved existing verified UUID
-- and vtv.reviewed_admin_reason to the written approval reference in this session.
-- No account, password or session is created. The user must enroll MFA afterward.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
DO $$
DECLARE approved_user uuid=nullif(current_setting('vtv.reviewed_admin_user',true),'')::uuid;
 approval text=nullif(current_setting('vtv.reviewed_admin_reason',true),'');
BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regnamespace('platform_admin') IS NULL OR approved_user IS NULL OR approval IS NULL OR length(approval) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'Initial administrator target or explicit review identity missing';END IF;
 PERFORM pg_advisory_xact_lock(7043043);
 IF EXISTS(SELECT 1 FROM platform_admin.grants WHERE active AND role='Super Admin')
 OR NOT EXISTS(SELECT 1 FROM web_auth.users WHERE id=approved_user AND status='active' AND email_verified_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Initial administrator already exists or approved identity is not active and verified';END IF;
 INSERT INTO platform_admin.grants(user_id,role) VALUES(approved_user,'Super Admin');
 INSERT INTO platform_admin.audit(actor_id,action,target_id,reason,details)
 VALUES(approved_user,'operator.initial_admin.provisioned',approved_user,approval,jsonb_build_object('performedByDatabaseRole',session_user,'mfaRequired',true));
END $$;
COMMIT;

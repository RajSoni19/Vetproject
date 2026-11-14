-- REVIEW ONLY. Separate exact checksum approval and fresh verified backup required.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.onboarding_commands') IS NULL OR to_regclass('saas.team_invitations') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved target or team schema state'; END IF;
END $$;
GRANT SELECT(email,full_name) ON web_auth.users TO vtv_saas_owner;
GRANT UPDATE(role,status) ON web_auth.company_memberships TO vtv_saas_owner;
SET LOCAL ROLE vtv_web_owner;
ALTER TABLE web_auth.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
ALTER TABLE web_auth.notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK(kind IN('verify_email','reset_password','team_invitation'));
RESET ROLE;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE saas.team_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254 AND email=lower(email)),
 role text NOT NULL CHECK(role IN('Admin','Finance','Accountant','Procurement','Inventory','Staff','Viewer')),
 token_hash char(64) NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),created_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',accepted_at timestamptz,revoked_at timestamptz,
 CHECK(expires_at>created_at),CHECK(NOT(accepted_at IS NOT NULL AND revoked_at IS NOT NULL)));
CREATE INDEX team_pending ON saas.team_invitations(company_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE saas.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.team_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_team ON saas.team_invitations TO vtv_saas_owner USING(true) WITH CHECK(true);
-- All commands lock identity/session, then the shared billing account. Invites
-- and acceptances count distinct seats across every company on that account.
CREATE FUNCTION saas.team_identity(p_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; sid uuid; BEGIN
 IF session_user<>'vtv_web_runtime' OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Session required' USING ERRCODE='42501'; END IF;
 SELECT s.user_id,s.id INTO actor,sid FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL;
 IF actor IS NULL THEN RAISE EXCEPTION 'Verified session required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM web_auth.users WHERE id=actor AND status='active' AND email_verified_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active user required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM web_auth.sessions WHERE id=sid AND revoked_at IS NULL AND expires_at>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.session_hash',p_hash,true);RETURN actor;
 END $$;
CREATE FUNCTION saas.team_context(p_actor uuid,p_company uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE account uuid; BEGIN
 PERFORM set_config('app.company_id',p_company::text,true);
 IF p_actor IS DISTINCT FROM saas.current_actor() OR NOT saas.authorized_company(p_company,'members:manage') THEN RAISE EXCEPTION 'Team management permission required' USING ERRCODE='42501'; END IF;
 SELECT a.id INTO account FROM saas.billing_accounts a JOIN saas.company_profiles cp ON cp.account_id=a.id WHERE cp.company_id=p_company AND a.status='active' AND cp.status='active' FOR UPDATE OF a;
 IF account IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 RETURN account;
 END $$;
CREATE FUNCTION saas.team_snapshot(p_hash text,p_company uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; account uuid; BEGIN
 actor=saas.team_identity(p_hash);account=saas.team_context(actor,p_company);
 RETURN jsonb_build_object('members',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'email',u.email,'role',m.role,'status',m.status) ORDER BY u.full_name,u.id) FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id WHERE m.company_id=p_company),'[]'::jsonb),
 'invitations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'expiresAt',i.expires_at,'acceptedAt',i.accepted_at,'revokedAt',i.revoked_at) ORDER BY i.created_at DESC) FROM (SELECT * FROM saas.team_invitations WHERE company_id=p_company ORDER BY created_at DESC LIMIT 100) i),'[]'::jsonb));
 END $$;
CREATE FUNCTION saas.invite_team(p_hash text,p_company uuid,p_email text,p_role text,p_token char(64)) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; account uuid; allowance integer; seats integer; invited uuid; existing saas.team_invitations; BEGIN
 actor=saas.team_identity(p_hash);account=saas.team_context(actor,p_company);
 IF p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 254 OR p_email<>lower(p_email) OR p_email~'[[:cntrl:]]' OR p_role IS NULL OR p_role NOT IN('Admin','Finance','Accountant','Procurement','Inventory','Staff','Viewer') OR p_token IS NULL OR p_token!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM saas.team_invitations WHERE token_hash=p_token;
 IF FOUND THEN
  IF existing.company_id<>p_company OR existing.email<>p_email OR existing.role<>p_role OR existing.created_by<>actor THEN RAISE EXCEPTION 'Invitation reference conflict' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',existing.id,'name',(SELECT name FROM web_auth.companies WHERE id=p_company),'created',false);
 END IF;
 SELECT seat_limit INTO allowance FROM saas.subscription_entitlements WHERE account_id=account AND status='active' AND verified_at IS NOT NULL AND source_reference IS NOT NULL FOR SHARE;
 IF allowance IS NULL THEN RAISE EXCEPTION 'Verified seat allowance required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id WHERE m.company_id=p_company AND u.email=p_email AND m.status='active') OR EXISTS(SELECT 1 FROM saas.team_invitations WHERE company_id=p_company AND email=p_email AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'Member or invitation already exists' USING ERRCODE='23505'; END IF;
 SELECT count(*) INTO seats FROM (SELECT u.email FROM web_auth.company_memberships m JOIN web_auth.users u ON u.id=m.user_id JOIN saas.company_profiles cp ON cp.company_id=m.company_id WHERE cp.account_id=account AND cp.status<>'archived' AND m.status='active'
 UNION SELECT i.email FROM saas.team_invitations i JOIN saas.company_profiles cp ON cp.company_id=i.company_id WHERE cp.account_id=account AND cp.status<>'archived' AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
 UNION SELECT p_email) distinct_seats;
 IF seats>allowance THEN RAISE EXCEPTION 'Shared seat allowance reached' USING ERRCODE='23505'; END IF;
 INSERT INTO saas.team_invitations(company_id,email,role,token_hash,created_by) VALUES(p_company,p_email,p_role,p_token,actor) RETURNING id INTO invited;
 INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,p_company,'team.invited',jsonb_build_object('invitationId',invited,'role',p_role));
 RETURN jsonb_build_object('id',invited,'name',(SELECT name FROM web_auth.companies WHERE id=p_company),'created',true);
 END $$;
CREATE FUNCTION saas.accept_team(p_hash text,p_token char(64)) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; candidate saas.team_invitations; account uuid; allowance integer; seats integer; existing_role text; BEGIN
 actor=saas.team_identity(p_hash);
 SELECT * INTO candidate FROM saas.team_invitations WHERE token_hash=p_token;
 IF NOT FOUND OR candidate.revoked_at IS NOT NULL OR candidate.expires_at<=now() OR candidate.email IS DISTINCT FROM (SELECT email FROM web_auth.users WHERE id=actor) THEN RAISE EXCEPTION 'Invitation unavailable for this identity' USING ERRCODE='42501'; END IF;
 SELECT a.id INTO account FROM saas.billing_accounts a JOIN saas.company_profiles cp ON cp.account_id=a.id WHERE cp.company_id=candidate.company_id AND cp.status='active' AND a.status='active' FOR UPDATE OF a;
 IF account IS NULL THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 SELECT * INTO candidate FROM saas.team_invitations WHERE id=candidate.id FOR UPDATE;
 IF candidate.accepted_at IS NOT NULL THEN RETURN jsonb_build_object('companyId',candidate.company_id,'accepted',true); END IF;
 IF candidate.revoked_at IS NOT NULL OR candidate.expires_at<=now() THEN RAISE EXCEPTION 'Invitation expired or revoked' USING ERRCODE='42501'; END IF;
 SELECT seat_limit INTO allowance FROM saas.subscription_entitlements WHERE account_id=account AND status='active' AND verified_at IS NOT NULL AND source_reference IS NOT NULL FOR SHARE;
 SELECT count(DISTINCT m.user_id) INTO seats FROM web_auth.company_memberships m JOIN saas.company_profiles cp ON cp.company_id=m.company_id WHERE cp.account_id=account AND cp.status<>'archived' AND m.status='active' AND m.user_id<>actor;
 IF allowance IS NULL OR seats>=allowance THEN RAISE EXCEPTION 'Shared seat allowance reached' USING ERRCODE='23505'; END IF;
 SELECT role INTO existing_role FROM web_auth.company_memberships WHERE user_id=actor AND company_id=candidate.company_id;
 IF FOUND THEN RAISE EXCEPTION 'Existing membership requires an owner review' USING ERRCODE='23505'; END IF;
 INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES(actor,candidate.company_id,candidate.role,'active');
 UPDATE saas.team_invitations SET accepted_at=now() WHERE id=candidate.id;
 INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action) VALUES(actor,candidate.company_id,'team.invitation-accepted');
 RETURN jsonb_build_object('companyId',candidate.company_id,'accepted',true);
 END $$;
CREATE FUNCTION saas.revoke_team_invitation(p_hash text,p_company uuid,p_invitation uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; account uuid; BEGIN
 actor=saas.team_identity(p_hash);account=saas.team_context(actor,p_company);
 UPDATE saas.team_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=p_invitation AND company_id=p_company AND accepted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending invitation required' USING ERRCODE='23505'; END IF;
 INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,p_company,'team.invitation-revoked',jsonb_build_object('invitationId',p_invitation));RETURN true;
 END $$;
REVOKE ALL ON TABLE saas.team_invitations FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
CREATE FUNCTION saas.change_team_member(p_hash text,p_company uuid,p_user uuid,p_role text,p_status text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE actor uuid; account uuid; previous text; allowance integer; seats integer; BEGIN
 actor=saas.team_identity(p_hash);account=saas.team_context(actor,p_company);
 IF NOT EXISTS(SELECT 1 FROM web_auth.company_memberships WHERE company_id=p_company AND user_id=actor AND role='Owner' AND status='active') OR p_user=actor THEN RAISE EXCEPTION 'Another member and company owner required' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN('Admin','Finance','Accountant','Procurement','Inventory','Staff','Viewer') OR p_status IS NULL OR p_status NOT IN('active','suspended') THEN RAISE EXCEPTION 'Invalid membership change' USING ERRCODE='22023'; END IF;
 SELECT role INTO previous FROM web_auth.company_memberships WHERE company_id=p_company AND user_id=p_user FOR UPDATE;
 IF previous IS NULL OR previous='Owner' THEN RAISE EXCEPTION 'Owner membership cannot be changed here' USING ERRCODE='42501'; END IF;
 IF p_status='active' THEN
  SELECT seat_limit INTO allowance FROM saas.subscription_entitlements WHERE account_id=account AND status='active' AND verified_at IS NOT NULL AND source_reference IS NOT NULL FOR SHARE;
  SELECT count(DISTINCT m.user_id) INTO seats FROM web_auth.company_memberships m JOIN saas.company_profiles cp ON cp.company_id=m.company_id WHERE cp.account_id=account AND cp.status<>'archived' AND m.status='active' AND m.user_id<>p_user;
  IF allowance IS NULL OR seats>=allowance THEN RAISE EXCEPTION 'Shared seat allowance reached' USING ERRCODE='23505'; END IF;
 END IF;
 UPDATE web_auth.company_memberships SET role=p_role,status=p_status WHERE company_id=p_company AND user_id=p_user;
 INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES(actor,p_company,'team.member-changed',jsonb_build_object('memberId',p_user,'role',p_role,'status',p_status));RETURN true;
 END $$;
REVOKE ALL ON FUNCTION saas.change_team_member(text,uuid,uuid,text,text) FROM PUBLIC,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION saas.change_team_member(text,uuid,uuid,text,text) TO vtv_web_runtime;
REVOKE ALL ON FUNCTION saas.team_identity(text),saas.team_context(uuid,uuid),saas.team_snapshot(text,uuid),saas.invite_team(text,uuid,text,text,char(64)),saas.accept_team(text,char(64)),saas.revoke_team_invitation(text,uuid,uuid) FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime;
GRANT EXECUTE ON FUNCTION saas.team_snapshot(text,uuid),saas.invite_team(text,uuid,text,text,char(64)),saas.accept_team(text,char(64)),saas.revoke_team_invitation(text,uuid,uuid) TO vtv_web_runtime;
COMMIT;

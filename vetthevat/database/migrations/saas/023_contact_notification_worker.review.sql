-- REVIEW ONLY. Not approved and not executed. Local isolated development target.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('contact_intake.notification_outbox') IS NULL OR to_regprocedure('contact_intake.runtime_identity()') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_contact_worker') THEN RAISE EXCEPTION 'Unapproved contact worker target/schema';END IF;
END $$;
CREATE ROLE vtv_contact_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
-- No password or email/worker activation. Private login provisioning is separate.
GRANT CONNECT ON DATABASE vtv_saas_dev TO vtv_contact_worker;
SET LOCAL ROLE vtv_saas_owner;
CREATE FUNCTION contact_intake.runtime_identity() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT installation_id FROM saas.schema_version WHERE version=1; $$;
CREATE FUNCTION contact_intake.claim_notice() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job contact_intake.notification_outbox;token uuid;payload jsonb;submitted timestamptz;BEGIN
 IF session_user<>'vtv_contact_worker' THEN RAISE EXCEPTION 'Contact worker required' USING ERRCODE='42501';END IF;
 UPDATE contact_intake.notification_outbox SET state='review',lease_id=NULL,lease_until=NULL WHERE state='pending' AND attempts>=8 AND (lease_until IS NULL OR lease_until<=now());
 SELECT * INTO job FROM contact_intake.notification_outbox WHERE state='pending' AND attempts<8 AND available_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF job.id IS NULL THEN RETURN NULL;END IF;
 token=gen_random_uuid();UPDATE contact_intake.notification_outbox SET attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=job.id;
 SELECT e.payload,e.created_at INTO payload,submitted FROM contact_intake.enquiries e WHERE e.id=job.enquiry_id;
 RETURN jsonb_build_object('id',job.id,'lease',token,'enquiryId',job.enquiry_id,'payload',payload,'createdAt',submitted::text);
END $$;
CREATE FUNCTION contact_intake.finish_notice(p_id uuid,p_lease uuid,p_provider text,p_failed boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job contact_intake.notification_outbox;BEGIN
 IF session_user<>'vtv_contact_worker' THEN RAISE EXCEPTION 'Contact worker required' USING ERRCODE='42501';END IF;
 SELECT * INTO job FROM contact_intake.notification_outbox WHERE id=p_id AND state='pending' AND lease_id=p_lease AND lease_until>now() FOR UPDATE;
 IF job.id IS NULL THEN RETURN false;END IF;
 IF p_failed IS NULL OR (NOT p_failed AND (p_provider IS NULL OR length(p_provider) NOT BETWEEN 1 AND 200 OR p_provider~'[[:cntrl:]]')) THEN RAISE EXCEPTION 'Invalid delivery receipt' USING ERRCODE='22023';END IF;
 UPDATE contact_intake.notification_outbox SET state=CASE WHEN NOT p_failed THEN 'accepted' WHEN attempts>=8 THEN 'review' ELSE 'pending' END,
 provider_id=CASE WHEN NOT p_failed THEN p_provider ELSE NULL END,available_at=CASE WHEN p_failed THEN now()+make_interval(secs=>least(3600,30*(2^attempts)::int)) ELSE available_at END,lease_id=NULL,lease_until=NULL WHERE id=p_id;
 RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION contact_intake.runtime_identity(),contact_intake.claim_notice(),contact_intake.finish_notice(uuid,uuid,text,boolean) FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime,vtv_contact_runtime,vtv_contact_worker;
GRANT USAGE ON SCHEMA contact_intake TO vtv_contact_worker;
GRANT EXECUTE ON FUNCTION contact_intake.runtime_identity() TO vtv_contact_runtime,vtv_contact_worker;
GRANT EXECUTE ON FUNCTION contact_intake.claim_notice(),contact_intake.finish_notice(uuid,uuid,text,boolean) TO vtv_contact_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA contact_intake FROM vtv_contact_worker;
RESET ROLE;
COMMIT;

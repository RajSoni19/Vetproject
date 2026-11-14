-- REVIEW ONLY. Separate approval required. Never imported by application startup.
-- Durable, private event inbox for already-verified Stripe/Resend webhooks.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR NOT EXISTS(SELECT 1 FROM saas.schema_version WHERE version=1)
 OR NOT EXISTS(SELECT 1 FROM business.migrations WHERE version=3 AND installation_id=(SELECT installation_id FROM saas.schema_version WHERE version=1))
 OR to_regclass('contact_intake.enquiries') IS NULL
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_provider_runtime')
 OR to_regclass('saas.provider_events') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or existing provider inbox'; END IF;
END $$;
CREATE ROLE vtv_saas_provider_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE vtv_saas_dev FROM vtv_saas_provider_runtime;
GRANT CONNECT ON DATABASE vtv_saas_dev TO vtv_saas_provider_runtime;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE saas.provider_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider text NOT NULL CHECK(provider IN('stripe','resend')),
 provider_event_id text NOT NULL CHECK(length(provider_event_id) BETWEEN 1 AND 200),payload_sha256 char(64) NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=262144),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','completed','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),lease_id uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT now(),received_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),UNIQUE(provider,provider_event_id));
CREATE INDEX provider_events_pending ON saas.provider_events(available_at,id) WHERE state IN('queued','processing');
ALTER TABLE saas.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.provider_events FORCE ROW LEVEL SECURITY;
CREATE POLICY provider_events_owner ON saas.provider_events FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE FUNCTION saas.record_provider_event(p_provider text,p_event_id text,p_digest char(64),p_payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE inserted boolean;existing char(64); BEGIN
 IF session_user<>'vtv_saas_provider_runtime' THEN RAISE EXCEPTION 'Provider runtime required' USING ERRCODE='42501'; END IF;
 IF p_provider NOT IN('stripe','resend') OR length(p_event_id) NOT BETWEEN 1 AND 200 OR p_digest !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>262144 THEN RAISE EXCEPTION 'Invalid provider event' USING ERRCODE='22023'; END IF;
 INSERT INTO saas.provider_events(provider,provider_event_id,payload_sha256,payload) VALUES(p_provider,p_event_id,p_digest,p_payload) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING true INTO inserted;
 IF inserted THEN RETURN true; END IF;
 SELECT payload_sha256 INTO existing FROM saas.provider_events WHERE provider=p_provider AND provider_event_id=p_event_id;
 IF existing IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'Provider event identity conflict' USING ERRCODE='23505'; END IF;
 RETURN false;
END $$;
REVOKE ALL ON TABLE saas.provider_events FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime;
GRANT USAGE ON SCHEMA saas TO vtv_saas_provider_runtime;
GRANT EXECUTE ON FUNCTION saas.record_provider_event(text,text,char(64),jsonb) TO vtv_saas_provider_runtime;
REVOKE ALL ON FUNCTION saas.record_provider_event(text,text,char(64),jsonb) FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime;
COMMIT;

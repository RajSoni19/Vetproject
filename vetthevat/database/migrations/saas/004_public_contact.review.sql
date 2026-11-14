-- CONTACT REVIEW ONLY. Does not require or execute pending Stage B migration 003.
-- No account, contact, company, financial data or email is seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR NOT EXISTS(SELECT 1 FROM saas.schema_version WHERE version=1)
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='saas' AND policyname='owner_authorization_lock' AND roles=ARRAY['vtv_saas_owner']::name[] AND with_check='false')<>2
 OR NOT EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba='vtv_saas_database_owner'::regrole)
 OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='contact_intake')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_contact_runtime')
 THEN RAISE EXCEPTION 'Contact migration target/state refused';END IF;
END $$;
CREATE ROLE vtv_contact_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
-- No password is assigned here; require separate random local service credential.
GRANT CONNECT ON DATABASE vtv_saas_dev TO vtv_contact_runtime;
CREATE SCHEMA contact_intake AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA contact_intake REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA contact_intake REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE contact_intake.enquiries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),installation_id uuid NOT NULL REFERENCES saas.schema_version(installation_id),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=20000),
 duplicate_hash char(64) NOT NULL UNIQUE CHECK(duplicate_hash ~ '^[a-f0-9]{64}$'),privacy_version text NOT NULL DEFAULT 'contact-2026-10-23',
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','contacted','closed')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX contact_enquiry_date ON contact_intake.enquiries(created_at,id);
CREATE TABLE contact_intake.submission_keys(
 key_hash char(64) PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'),digest char(64) NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 enquiry_id uuid REFERENCES contact_intake.enquiries(id));
CREATE TABLE contact_intake.rate_buckets(
 key text PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 100),count integer NOT NULL CHECK(count>=0),ends_at timestamptz NOT NULL);
CREATE TABLE contact_intake.notification_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),enquiry_id uuid NOT NULL UNIQUE REFERENCES contact_intake.enquiries(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','review')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 available_at timestamptz NOT NULL DEFAULT now(),lease_id uuid,lease_until timestamptz,provider_id text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX contact_outbox_pending ON contact_intake.notification_outbox(available_at,id) WHERE state='pending';
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['enquiries','submission_keys','rate_buckets','notification_outbox'] LOOP
  EXECUTE format('ALTER TABLE contact_intake.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE contact_intake.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY owner_commands ON contact_intake.%I TO vtv_saas_owner USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
-- These are global public enquiries, not tenant financial records. Only narrow
-- functions can access them; neither web/business runtime receives any access.
CREATE FUNCTION contact_intake.consume_rate(bucket text,maximum integer,seconds integer) RETURNS TABLE(allowed boolean,retry_after integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bucket_row contact_intake.rate_buckets;
BEGIN
 IF bucket IS NULL OR bucket !~ '^[a-z0-9:-]{1,100}$' OR maximum IS NULL OR maximum NOT BETWEEN 1 AND 300 OR seconds IS NULL OR seconds NOT BETWEEN 60 AND 86400 THEN RAISE EXCEPTION 'Invalid rate contract';END IF;
 INSERT INTO contact_intake.rate_buckets(key,count,ends_at) VALUES(bucket,0,now()+make_interval(secs=>seconds)) ON CONFLICT DO NOTHING;
 SELECT * INTO bucket_row FROM contact_intake.rate_buckets WHERE key=bucket FOR UPDATE;
 IF bucket_row.ends_at>now() AND bucket_row.count>=maximum THEN RETURN QUERY SELECT false,greatest(1,ceil(extract(epoch FROM bucket_row.ends_at-now()))::integer);RETURN;END IF;
 UPDATE contact_intake.rate_buckets SET count=CASE WHEN ends_at<=now() THEN 1 ELSE count+1 END,ends_at=CASE WHEN ends_at<=now() THEN now()+make_interval(secs=>seconds) ELSE ends_at END WHERE key=bucket;
 RETURN QUERY SELECT true,0;
END $$;
CREATE FUNCTION contact_intake.save_enquiry(body jsonb,request_key text,payload_digest text,duplicate_key text) RETURNS TABLE(id uuid,created_at timestamptz)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE keyrow contact_intake.submission_keys; saved contact_intake.enquiries;
BEGIN
 -- Explicitly bound schema; unknown recipient/role/ownership fields are rejected.
 IF body IS NULL OR jsonb_typeof(body)<>'object' OR octet_length(body::text)>20000
 OR (body-ARRAY['fullName','businessName','email','category','message','consent'])<>'{}'::jsonb
 OR jsonb_typeof(body->'fullName') IS DISTINCT FROM 'string' OR length(trim(body->>'fullName')) NOT BETWEEN 1 AND 120
 OR jsonb_typeof(body->'businessName') IS DISTINCT FROM 'string' OR length(trim(body->>'businessName')) NOT BETWEEN 1 AND 200
 OR jsonb_typeof(body->'email') IS DISTINCT FROM 'string' OR length(body->>'email') NOT BETWEEN 3 AND 254 OR (body->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 OR jsonb_typeof(body->'message') IS DISTINCT FROM 'string' OR length(trim(body->>'message')) NOT BETWEEN 1 AND 5000
 OR (body->>'category') IS NULL OR (body->>'category') NOT IN('VAT management','ORS','Account support','Other')
 OR body->'consent' IS DISTINCT FROM 'true'::jsonb
 OR request_key IS NULL OR request_key !~ '^[a-f0-9]{64}$' OR payload_digest IS NULL OR payload_digest !~ '^[a-f0-9]{64}$' OR duplicate_key IS NULL OR duplicate_key !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invalid contact contract';END IF;
 INSERT INTO contact_intake.submission_keys(key_hash,digest) VALUES(request_key,payload_digest) ON CONFLICT DO NOTHING;
 SELECT * INTO keyrow FROM contact_intake.submission_keys WHERE key_hash=request_key FOR UPDATE;
 IF keyrow.digest<>payload_digest THEN RAISE EXCEPTION 'Contact idempotency conflict';END IF;
 IF keyrow.enquiry_id IS NOT NULL THEN RETURN QUERY SELECT e.id,e.created_at FROM contact_intake.enquiries e WHERE e.id=keyrow.enquiry_id;RETURN;END IF;
 INSERT INTO contact_intake.enquiries(installation_id,payload,duplicate_hash) SELECT installation_id,body,duplicate_key FROM saas.schema_version WHERE version=1
 ON CONFLICT(duplicate_hash) DO UPDATE SET duplicate_hash=EXCLUDED.duplicate_hash RETURNING * INTO saved;
 IF saved.id IS NULL THEN RAISE EXCEPTION 'Contact was not saved';END IF;
 INSERT INTO contact_intake.notification_outbox(enquiry_id) VALUES(saved.id) ON CONFLICT DO NOTHING;
 UPDATE contact_intake.submission_keys SET enquiry_id=saved.id WHERE key_hash=request_key;
 RETURN QUERY SELECT saved.id,saved.created_at;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA contact_intake FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA contact_intake FROM PUBLIC;
GRANT USAGE ON SCHEMA contact_intake TO vtv_contact_runtime;
GRANT EXECUTE ON FUNCTION contact_intake.consume_rate(text,integer,integer),contact_intake.save_enquiry(jsonb,text,text,text) TO vtv_contact_runtime;
-- No table grants, list function, notification worker, provider credential,
-- company access, administrator creation or endpoint enablement is included.
RESET ROLE;
COMMIT;

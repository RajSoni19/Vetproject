-- REVIEW ONLY. No execution approved. Dedicated lead database/schema; do not
-- apply to production or to the VAT tenant drafts without separate approval.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'vetthevat_leads_test' OR current_user<>'vetthevat_leads_owner'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Explicit approved NOLOGIN lead owner required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vetthevat_leads_runtime' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication)
 OR pg_has_role('vetthevat_leads_runtime',current_user,'MEMBER')
 THEN RAISE EXCEPTION 'Restricted isolated runtime role required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
  AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION 'Review creator default ACLs'; END IF;
END $$;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
CREATE SCHEMA lead_intake;
REVOKE ALL ON SCHEMA lead_intake FROM PUBLIC;
CREATE TABLE lead_intake.schema_version(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),version integer NOT NULL CHECK(version=1));
INSERT INTO lead_intake.schema_version VALUES(true,1);
CREATE TABLE lead_intake.leads (
 id uuid PRIMARY KEY, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'consent'='true'),
 duplicate_hash char(64) NOT NULL CHECK(duplicate_hash ~ '^[a-f0-9]{64}$'),
 privacy_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','closed')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),version integer NOT NULL DEFAULT 1 CHECK(version>0)
);
CREATE INDEX lead_duplicate ON lead_intake.leads(duplicate_hash,created_at DESC);
CREATE INDEX lead_status ON lead_intake.leads(status,id);
CREATE TABLE lead_intake.idempotency (
 key_hash char(64) PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'),
 digest char(64) NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'), lead_id uuid NOT NULL REFERENCES lead_intake.leads(id)
);
CREATE TABLE lead_intake.rate_buckets (
 key text PRIMARY KEY CHECK(length(key)<=100),count integer NOT NULL CHECK(count>=0),ends_at timestamptz NOT NULL
);
CREATE TABLE lead_intake.outbox (
 id uuid PRIMARY KEY,lead_id uuid NOT NULL UNIQUE REFERENCES lead_intake.leads(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','manual_review')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),first_attempt_at timestamptz,
 lease_token uuid,lease_until timestamptz,provider_id text,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state<>'sending' OR lease_token IS NOT NULL AND lease_until IS NOT NULL),
 CHECK(state<>'accepted' OR provider_id IS NOT NULL AND accepted_at IS NOT NULL)
);
CREATE INDEX notification_queue ON lead_intake.outbox(state,next_attempt_at);
CREATE TABLE lead_intake.admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid NOT NULL REFERENCES lead_intake.leads(id),
 actor text NOT NULL,event text NOT NULL CHECK(event='lead.updated'),version integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['schema_version','leads','idempotency','rate_buckets','outbox','admin_audit'] LOOP
  EXECUTE format('ALTER TABLE lead_intake.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE lead_intake.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY server_access ON lead_intake.%I TO vetthevat_leads_runtime USING (true) WITH CHECK (true)',relation);
 END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA lead_intake FROM PUBLIC;
GRANT USAGE ON SCHEMA lead_intake TO vetthevat_leads_runtime;
GRANT SELECT ON lead_intake.schema_version,lead_intake.leads,lead_intake.idempotency,lead_intake.rate_buckets,lead_intake.outbox TO vetthevat_leads_runtime;
GRANT INSERT ON lead_intake.leads,lead_intake.idempotency,lead_intake.rate_buckets,lead_intake.outbox,lead_intake.admin_audit TO vetthevat_leads_runtime;
GRANT UPDATE(status,notes,version) ON lead_intake.leads TO vetthevat_leads_runtime;
GRANT UPDATE ON lead_intake.rate_buckets,lead_intake.outbox TO vetthevat_leads_runtime;
COMMIT;
-- No credentials or role provisioning supplied. Runtime is server-only and has
-- no DELETE/TRUNCATE or payload mutation. Admin HTTP authorization is mandatory.

-- REVIEW ONLY. Separate approval required; local and hosted startup never run migrations.
-- Adds a private, tenant-scoped supplier-image asset registry and an isolated scan queue.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.migrations') IS NULL
 OR NOT EXISTS(SELECT 1 FROM business.migrations WHERE version=3)
 OR to_regclass('business.supplier_logo_assets') IS NOT NULL
 OR to_regclass('business.supplier_logo_jobs') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_document_worker' AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unapproved target or missing approved Stage B schema'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;

CREATE TABLE business.supplier_logo_schema_version(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version integer NOT NULL CHECK(version=1),
 installation_id uuid NOT NULL REFERENCES saas.schema_version(installation_id),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business.supplier_logo_schema_version(version,installation_id)
 SELECT 1,installation_id FROM saas.schema_version WHERE version=1;

CREATE TABLE business.supplier_logo_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 object_key text NOT NULL,
 object_version text NOT NULL CHECK(length(object_version) BETWEEN 1 AND 1024),
 sha256 bytea NOT NULL CHECK(octet_length(sha256)=32),
 mime_type text NOT NULL CHECK(mime_type IN('image/jpeg','image/png','image/webp')),
 byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 5242880),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','clean','rejected','removed')),
 is_current boolean NOT NULL DEFAULT false,
 scanner text CHECK(scanner IS NULL OR length(scanner) BETWEEN 1 AND 200),
 policy_version text CHECK(policy_version IS NULL OR length(policy_version) BETWEEN 1 AND 100),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='clean' AND scanner IS NOT NULL AND policy_version IS NOT NULL) OR state<>'clean'),
 CHECK(NOT is_current OR state='clean'),
 CHECK(object_key='companies/'||company_id::text||'/suppliers/'||supplier_id::text||'/logos/'||id::text||'/'||encode(sha256,'hex')),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id)
);
CREATE UNIQUE INDEX supplier_logo_one_current ON business.supplier_logo_assets(company_id,supplier_id) WHERE is_current;
CREATE INDEX supplier_logo_history ON business.supplier_logo_assets(company_id,supplier_id,created_at DESC);

CREATE TABLE business.supplier_logo_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 asset_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','completed','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 lease_id uuid,
 lease_until timestamptz,
 available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((state='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
 FOREIGN KEY(company_id,asset_id) REFERENCES business.supplier_logo_assets(company_id,id),
 UNIQUE(company_id,id),
 UNIQUE(company_id,asset_id)
);
CREATE INDEX supplier_logo_pending ON business.supplier_logo_jobs(available_at,id) WHERE state IN('queued','processing');

ALTER TABLE business.supplier_logo_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.supplier_logo_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE business.supplier_logo_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.supplier_logo_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY owner_lookup ON business.supplier_logo_assets FOR SELECT TO vtv_saas_owner USING(true);
CREATE POLICY owner_lookup ON business.supplier_logo_jobs FOR SELECT TO vtv_saas_owner USING(true);
CREATE POLICY owner_logo_mutation ON business.supplier_logo_assets FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_logo_job_mutation ON business.supplier_logo_jobs FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY logo_read ON business.supplier_logo_assets FOR SELECT TO vtv_saas_runtime
 USING(business.scope(company_id,'contacts:read') OR business.scope(company_id,'contacts:write'));
CREATE POLICY logo_insert ON business.supplier_logo_assets FOR INSERT TO vtv_saas_runtime
 WITH CHECK(business.scope(company_id,'contacts:write') AND state='pending' AND NOT is_current);
CREATE POLICY logo_update ON business.supplier_logo_assets FOR UPDATE TO vtv_saas_runtime
 USING(business.scope(company_id,'contacts:write'))
 WITH CHECK(business.scope(company_id,'contacts:write') AND state='removed' AND NOT is_current);
CREATE POLICY logo_job_insert ON business.supplier_logo_jobs FOR INSERT TO vtv_saas_runtime
 WITH CHECK(business.scope(company_id,'contacts:write') AND state='queued' AND attempts=0);
CREATE POLICY logo_job_cancel ON business.supplier_logo_jobs FOR UPDATE TO vtv_saas_runtime
 USING(business.scope(company_id,'contacts:write'))
 WITH CHECK(business.scope(company_id,'contacts:write') AND state='cancelled');

CREATE FUNCTION business.check_supplier_logo() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE supplier_kind text;
BEGIN
 SELECT kind INTO supplier_kind FROM business.counterparties WHERE company_id=NEW.company_id AND id=NEW.supplier_id;
 IF supplier_kind IS DISTINCT FROM 'supplier' THEN RAISE EXCEPTION 'Supplier contact required'; END IF;
 IF session_user='vtv_saas_runtime' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.state<>'pending' OR NEW.is_current OR NEW.scanner IS NOT NULL OR NEW.policy_version IS NOT NULL THEN RAISE EXCEPTION 'Pending supplier image required'; END IF;
  ELSE
   IF NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id OR NEW.supplier_id<>OLD.supplier_id
    OR NEW.object_key<>OLD.object_key OR NEW.object_version<>OLD.object_version OR NEW.sha256<>OLD.sha256
    OR NEW.mime_type<>OLD.mime_type OR NEW.byte_size<>OLD.byte_size OR NEW.created_by<>OLD.created_by
    OR NEW.created_at<>OLD.created_at OR NEW.state<>'removed' OR NEW.is_current
    OR NEW.scanner IS DISTINCT FROM OLD.scanner OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    THEN RAISE EXCEPTION 'Supplier image mutation is not permitted'; END IF;
  END IF;
 ELSIF session_user<>'vtv_saas_document_worker' THEN
  RAISE EXCEPTION 'Unapproved supplier image writer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER supplier_logo_guard BEFORE INSERT OR UPDATE ON business.supplier_logo_assets
 FOR EACH ROW EXECUTE FUNCTION business.check_supplier_logo();

CREATE FUNCTION business.claim_supplier_logo_inspection()
 RETURNS TABLE(job_id uuid,lease_id uuid,company_id uuid,supplier_id uuid,asset_id uuid,object_key text,object_version text,sha256 text,mime_type text,byte_size bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j business.supplier_logo_jobs; a business.supplier_logo_assets; token uuid;
BEGIN
 UPDATE business.supplier_logo_jobs SET state='failed',lease_id=NULL,lease_until=NULL
  WHERE state='processing' AND lease_until<now() AND attempts>=5;
 UPDATE business.supplier_logo_assets a SET state='rejected',scanner='lease-timeout',policy_version='supplier-logo-v1',updated_at=now()
  WHERE a.state='pending' AND EXISTS(SELECT 1 FROM business.supplier_logo_jobs q WHERE q.company_id=a.company_id AND q.asset_id=a.id AND q.state='failed' AND q.attempts>=5);
 SELECT * INTO j FROM business.supplier_logo_jobs q
  WHERE q.attempts<5 AND q.available_at<=now() AND
   (q.state='queued' OR(q.state='processing' AND q.lease_until<now()))
   AND EXISTS(SELECT 1 FROM business.supplier_logo_assets x WHERE x.company_id=q.company_id AND x.id=q.asset_id AND x.state='pending')
  ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN; END IF;
 SELECT * INTO a FROM business.supplier_logo_assets x WHERE x.company_id=j.company_id AND x.id=j.asset_id FOR UPDATE;
 IF a.id IS NULL OR a.state<>'pending' THEN RETURN; END IF;
 token=gen_random_uuid();
 UPDATE business.supplier_logo_jobs SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=j.id;
 RETURN QUERY SELECT j.id,token,a.company_id,a.supplier_id,a.id,a.object_key,a.object_version,encode(a.sha256,'hex'),a.mime_type,a.byte_size;
END $$;

CREATE FUNCTION business.finish_supplier_logo_inspection(job uuid,lease uuid,verdict text,engine text,policy text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j business.supplier_logo_jobs; a business.supplier_logo_assets;
BEGIN
 IF verdict NOT IN('clean','infected','error') OR verdict IS NULL OR engine IS NULL OR policy IS NULL
  OR length(engine) NOT BETWEEN 1 AND 200 OR length(policy) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid supplier image inspection receipt'; END IF;
 SELECT * INTO j FROM business.supplier_logo_jobs
  WHERE id=job AND state='processing' AND lease_id=lease AND lease_until>now() FOR UPDATE;
 IF j.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO a FROM business.supplier_logo_assets WHERE company_id=j.company_id AND id=j.asset_id FOR UPDATE;
 IF a.id IS NULL OR a.state<>'pending' THEN
  UPDATE business.supplier_logo_jobs SET state='cancelled',lease_id=NULL,lease_until=NULL WHERE id=j.id;
  RETURN false;
 END IF;
 IF verdict='clean' THEN
  UPDATE business.supplier_logo_assets SET is_current=false,updated_at=now()
   WHERE company_id=a.company_id AND supplier_id=a.supplier_id AND is_current;
  UPDATE business.supplier_logo_assets SET state='clean',is_current=true,scanner=engine,policy_version=policy,updated_at=now()
   WHERE company_id=a.company_id AND id=a.id;
 ELSIF verdict='infected' THEN
  UPDATE business.supplier_logo_assets SET state='rejected',is_current=false,scanner=engine,policy_version=policy,updated_at=now()
   WHERE company_id=a.company_id AND id=a.id;
 ELSIF j.attempts>=5 THEN
  UPDATE business.supplier_logo_assets SET state='rejected',is_current=false,scanner=engine,policy_version=policy,updated_at=now()
   WHERE company_id=a.company_id AND id=a.id;
 END IF;
 UPDATE business.supplier_logo_jobs SET
  state=CASE WHEN verdict='error' AND attempts<5 THEN 'queued' WHEN verdict='error' THEN 'failed' ELSE 'completed' END,
  lease_id=NULL,lease_until=NULL,available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::integer))
  WHERE id=j.id;
 RETURN true;
END $$;

REVOKE ALL ON business.supplier_logo_schema_version,business.supplier_logo_assets,business.supplier_logo_jobs FROM PUBLIC;
REVOKE ALL ON FUNCTION business.check_supplier_logo(),business.claim_supplier_logo_inspection(),business.finish_supplier_logo_inspection(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT SELECT ON business.supplier_logo_schema_version TO vtv_saas_runtime;
GRANT SELECT ON business.supplier_logo_schema_version TO vtv_saas_document_worker;
GRANT SELECT,INSERT,UPDATE ON business.supplier_logo_assets TO vtv_saas_runtime;
GRANT INSERT ON business.supplier_logo_jobs TO vtv_saas_runtime;
GRANT UPDATE(state,lease_id,lease_until) ON business.supplier_logo_jobs TO vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION business.claim_supplier_logo_inspection(),business.finish_supplier_logo_inspection(uuid,uuid,text,text,text) TO vtv_saas_document_worker;
COMMIT;

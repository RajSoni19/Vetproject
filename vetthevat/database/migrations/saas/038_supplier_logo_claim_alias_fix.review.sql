-- REVIEW ONLY. Separate approval required; local and hosted startup never run migrations.
-- Replaces only the supplier-logo claim function to remove a PL/pgSQL name collision.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE installed_function_hash text;
BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.supplier_logo_schema_version') IS NULL
 OR to_regclass('business.supplier_logo_assets') IS NULL
 OR to_regclass('business.supplier_logo_jobs') IS NULL
 OR to_regprocedure('business.claim_supplier_logo_inspection()') IS NULL
 OR NOT EXISTS(
   SELECT 1 FROM business.supplier_logo_schema_version v
   JOIN saas.schema_version s ON s.installation_id=v.installation_id AND s.version=1
   WHERE v.singleton AND v.version=1
 )
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole))
 THEN RAISE EXCEPTION 'Unapproved target or supplier-logo schema state'; END IF;
 SELECT encode(sha256(convert_to(pg_get_functiondef('business.claim_supplier_logo_inspection()'::regprocedure),'UTF8')),'hex')
 INTO installed_function_hash;
 IF installed_function_hash<>'597bd0fd6deaa4803a47fc7ae277a139a78581490a305b6a7ffe1002a645be6f'
 THEN RAISE EXCEPTION 'Supplier-logo claim function changed; inspect instead of retrying'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE OR REPLACE FUNCTION business.claim_supplier_logo_inspection()
 RETURNS TABLE(job_id uuid,lease_id uuid,company_id uuid,supplier_id uuid,asset_id uuid,object_key text,object_version text,sha256 text,mime_type text,byte_size bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j business.supplier_logo_jobs; a business.supplier_logo_assets; token uuid;
BEGIN
 UPDATE business.supplier_logo_jobs SET state='failed',lease_id=NULL,lease_until=NULL
  WHERE state='processing' AND lease_until<now() AND attempts>=5;
 UPDATE business.supplier_logo_assets AS asset_row
  SET state='rejected',scanner='lease-timeout',policy_version='supplier-logo-v1',updated_at=now()
  WHERE asset_row.state='pending' AND EXISTS(
   SELECT 1 FROM business.supplier_logo_jobs q
   WHERE q.company_id=asset_row.company_id AND q.asset_id=asset_row.id AND q.state='failed' AND q.attempts>=5
  );
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
COMMIT;

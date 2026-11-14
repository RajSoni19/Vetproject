-- REVIEW ONLY. No application startup executes this file.
-- Establishes an immutable activation fence: existing documents are excluded.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.local_document_scope') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved local worker scope target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DO $$ DECLARE original_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check';
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format('ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation=%L)',original_expression,'document.processing.retry');
END $$;
CREATE TABLE business.local_document_scope(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),created_after timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO business.local_document_scope(singleton) VALUES(true);
ALTER TABLE business.local_document_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.local_document_scope FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_owner ON business.local_document_scope FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY scope_read ON business.local_document_scope FOR SELECT TO vtv_saas_runtime,vtv_saas_document_worker USING(true);
REVOKE ALL ON business.local_document_scope FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime,vtv_saas_document_worker;
GRANT SELECT ON business.local_document_scope TO vtv_saas_runtime,vtv_saas_document_worker;
CREATE OR REPLACE FUNCTION business.claim_local_inspection()
 RETURNS TABLE(job_id uuid, lease_id uuid, company_id uuid, document_id uuid, object_key text, object_version text, sha256 text, byte_size bigint, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE j saas.document_jobs; d saas.documents; token uuid;
BEGIN
 UPDATE saas.document_jobs SET state='failed',lease_id=NULL,lease_until=NULL WHERE kind='inspect' AND state='processing' AND lease_until<now() AND attempts>=5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=saas.document_jobs.company_id AND eligible.id=saas.document_jobs.document_id AND eligible.created_at>=fence.created_after);
 SELECT * INTO j FROM saas.document_jobs q WHERE q.kind='inspect' AND q.attempts<5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=q.company_id AND eligible.id=q.document_id AND eligible.created_at>=fence.created_after) AND q.available_at<=now()
  AND (q.state='queued' OR (q.state='processing' AND q.lease_until<now())) ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN;END IF;
 SELECT * INTO d FROM saas.documents WHERE id=j.document_id AND saas.documents.company_id=j.company_id;
 IF d.state<>'quarantined' OR d.object_version IS NULL THEN RETURN;END IF;
 token=gen_random_uuid();
 UPDATE saas.document_jobs SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=j.id;
 RETURN QUERY SELECT j.id,token,d.company_id,d.id,d.object_key,d.object_version,d.sha256::text,d.byte_size,d.mime_type;
END $function$
;
CREATE OR REPLACE FUNCTION business.claim_local_extraction()
 RETURNS TABLE(job_id uuid, lease_id uuid, company_id uuid, document_id uuid, object_key text, object_version text, sha256 text, byte_size bigint, mime_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE j business.extraction_jobs; d saas.documents; token uuid;
BEGIN
 UPDATE business.extraction_jobs SET state='failed',error_code='TIMEOUT',lease_id=NULL,lease_until=NULL WHERE state='processing' AND lease_until<now() AND attempts>=5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=business.extraction_jobs.company_id AND eligible.id=business.extraction_jobs.document_id AND eligible.created_at>=fence.created_after);
 SELECT * INTO j FROM business.extraction_jobs q WHERE q.attempts<5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=q.company_id AND eligible.id=q.document_id AND eligible.created_at>=fence.created_after) AND q.available_at<=now() AND (q.state='queued' OR (q.state='processing' AND q.lease_until<now())) ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN;END IF;
 SELECT * INTO d FROM saas.documents WHERE saas.documents.company_id=j.company_id AND id=j.document_id;
 IF d.state<>'clean' OR d.object_version<>j.object_version OR d.sha256<>j.sha256 OR NOT EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean') THEN RETURN;END IF;
 token=gen_random_uuid();UPDATE business.extraction_jobs SET state='processing',attempts=attempts+1,lease_id=token,lease_until=now()+interval '120 seconds' WHERE id=j.id;
 RETURN QUERY SELECT j.id,token,d.company_id,d.id,d.object_key,d.object_version,d.sha256::text,d.byte_size,d.mime_type;
END $function$
;
CREATE FUNCTION business.retry_local_document(company uuid,document uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE changed integer:=0; affected integer;
BEGIN
 IF NOT business.scope(company,'documents:write') OR NOT saas.authorized_company(company,'documents:read') THEN RAISE EXCEPTION 'Document recovery permission required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.documents d JOIN business.local_document_scope fence ON fence.singleton WHERE d.company_id=company AND d.id=document AND d.created_at>=fence.created_after AND d.state IN('quarantined','clean')) THEN RAISE EXCEPTION 'Document is outside the approved new-upload scope'; END IF;
 UPDATE saas.document_jobs j SET state='queued',available_at=now(),lease_id=NULL,lease_until=NULL WHERE j.company_id=company AND j.document_id=document AND j.kind='inspect' AND j.state='failed' AND j.attempts<5 AND EXISTS(SELECT 1 FROM saas.documents d WHERE d.company_id=company AND d.id=document AND d.state='quarantined');
 GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected;
 UPDATE business.extraction_jobs j SET state='queued',available_at=now(),lease_id=NULL,lease_until=NULL,error_code=NULL WHERE j.company_id=company AND j.document_id=document AND j.state='failed' AND j.attempts<5 AND j.error_code IN('TIMEOUT','UNAVAILABLE') AND EXISTS(SELECT 1 FROM saas.documents d JOIN saas.document_inspections i ON i.company_id=d.company_id AND i.document_id=d.id AND i.sha256=d.sha256 AND i.object_version=d.object_version AND i.verdict='clean' WHERE d.company_id=company AND d.id=document AND d.state='clean' AND d.sha256=j.sha256 AND d.object_version=j.object_version);
 GET DIAGNOSTICS affected=ROW_COUNT; changed:=changed+affected; RETURN changed;
END $$;
REVOKE ALL ON FUNCTION business.claim_local_inspection(),business.claim_local_extraction(),business.retry_local_document(uuid,uuid) FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime,vtv_saas_document_worker;
GRANT EXECUTE ON FUNCTION business.claim_local_inspection(),business.claim_local_extraction() TO vtv_saas_document_worker;
GRANT EXECUTE ON FUNCTION business.retry_local_document(uuid,uuid) TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

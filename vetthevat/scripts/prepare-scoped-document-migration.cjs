// Preparation only: reads installed function definitions, writes review files.
const s=require('./saas-dev-common.cjs'),{Client}=require('pg');
async function main(){const db=new Client(s.connection('vtv_saas_operator'));await db.connect();try{
 const functions=[];for(const kind of ['inspection','extraction']){let sql=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[`business.claim_${kind}()`])).rows[0].definition;
  if(!sql.includes('q.attempts<5')||!sql.includes("state='processing' AND lease_until<now() AND attempts>=5"))throw Error('Unexpected installed claim function.');
  sql=sql.replace(`business.claim_${kind}()`,`business.claim_local_${kind}()`);
  const table=kind==='inspection'?'saas.document_jobs':'business.extraction_jobs';
  sql=sql.replace("state='processing' AND lease_until<now() AND attempts>=5",`state='processing' AND lease_until<now() AND attempts>=5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=${table}.company_id AND eligible.id=${table}.document_id AND eligible.created_at>=fence.created_after)`);
  sql=sql.replace('q.attempts<5',`q.attempts<5 AND EXISTS(SELECT 1 FROM saas.documents eligible JOIN business.local_document_scope fence ON fence.singleton WHERE eligible.company_id=q.company_id AND eligible.id=q.document_id AND eligible.created_at>=fence.created_after)`);
  functions.push(sql+';');
 }
 const header=`-- REVIEW ONLY. No application startup executes this file.
-- Establishes an immutable activation fence: existing documents are excluded.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\\\','/')<>'D:/vetthevat.saas-dev/cluster'
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
`;
 const retry=`
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
`;
 s.fs.writeFileSync(s.path.join(s.root,'database/migrations/saas/037_local_document_queue_scope.review.sql'),header+functions.join('\n')+retry);
 console.log('Prepared migration 037; no SQL was executed other than read-only function inspection.');
 }finally{await db.end();}}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});

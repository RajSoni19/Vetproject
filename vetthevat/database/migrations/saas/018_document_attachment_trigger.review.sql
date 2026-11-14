-- REVIEW ONLY. Separate approval required; fixes one polymorphic trigger body.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.onboarding_commands') IS NULL
 OR to_regprocedure('business.check_draft_child()') IS NULL
 OR encode(sha256(convert_to(pg_get_functiondef('business.check_draft_child()'::regprocedure),'UTF8')),'hex')<>'c27b34e47d1da2f351e797eb7c1a98c63d74038a9845dbe4e80b506fd358af77'
 THEN RAISE EXCEPTION 'Unapproved target or missing draft trigger'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE OR REPLACE FUNCTION business.check_draft_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c uuid; i uuid; parent business.invoices; doc saas.documents;
BEGIN
 IF TG_OP='DELETE' THEN c=OLD.company_id;i=OLD.invoice_id;ELSE c=NEW.company_id;i=NEW.invoice_id;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(i::text,832));
 SELECT * INTO parent FROM business.invoices WHERE company_id=c AND id=i;
 IF NOT (TG_TABLE_NAME='extraction_jobs' AND i IS NULL) AND (parent.id IS NULL OR parent.state<>'draft' OR NOT business.scope(c,CASE WHEN parent.kind='credit-note' THEN 'invoices:correct' ELSE 'invoices:write' END)) THEN RAISE EXCEPTION 'Writable draft required';END IF;
 IF TG_TABLE_NAME='extraction_jobs' AND i IS NULL AND session_user<>'vtv_saas_document_worker' AND NOT business.scope(c,'invoices:write') THEN RAISE EXCEPTION 'Extraction capability required';END IF;
 IF TG_TABLE_NAME IN('invoice_attachments','extraction_jobs') THEN
  SELECT * INTO doc FROM saas.documents WHERE company_id=c AND id=NEW.document_id;
  IF doc.id IS NULL OR (session_user<>'vtv_saas_document_worker' AND NOT saas.authorized_company(c,'documents:read')) THEN RAISE EXCEPTION 'Owned original required';END IF;
  -- PL/pgSQL plans each expression against the concrete NEW row type. A
  -- boolean AND does not protect nonexistent fields on an attachment row.
  IF TG_TABLE_NAME='extraction_jobs' THEN
   IF doc.state<>'clean' OR doc.object_version<>NEW.object_version OR doc.sha256<>NEW.sha256 OR NOT EXISTS(SELECT 1 FROM saas.document_inspections s WHERE s.company_id=c AND s.document_id=doc.id AND s.object_version=doc.object_version AND s.sha256=doc.sha256 AND s.verdict='clean') THEN RAISE EXCEPTION 'Trusted matching inspection required';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
COMMIT;

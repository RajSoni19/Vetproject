-- REVIEW ONLY. Adds company-scoped, one-module-at-a-time review initialization.
-- No purpose edits, review-state updates, or backfill are performed by this migration.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('invoice_routing.purposes') IS NULL
 OR to_regclass('invoice_routing.module_reviews') IS NULL
 OR to_regclass('invoice_routing.module_review_events') IS NULL
 OR to_regprocedure('invoice_routing.module_review_initializer_scope(uuid,text)') IS NOT NULL
 OR to_regprocedure('invoice_routing.initialize_module_reviews(uuid,text)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='invoice_routing' AND tablename='purposes' AND policyname='module_review_initializer_purposes')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Unapproved module-review initializer migration target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE FUNCTION invoice_routing.module_review_initializer_scope(target_company uuid,target_module text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE required_permission text; actor uuid; active_session uuid; selected_company uuid;
BEGIN
 IF target_module IS NULL OR target_module NOT IN('vat','ors') THEN RETURN false; END IF;
 required_permission:=CASE target_module WHEN 'vat' THEN 'invoices:write' ELSE 'procurement:write' END;
 IF current_setting('app.company_id',true) IS DISTINCT FROM target_company::text
 OR current_setting('app.permission',true) IS DISTINCT FROM required_permission
 OR NOT saas.authorized_company(target_company,'company:manage')
 OR NOT saas.authorized_company(target_company,'documents:read')
 OR NOT saas.authorized_company(target_company,required_permission) THEN RETURN false; END IF;
 actor:=saas.current_actor(); active_session:=saas.current_session();
 IF actor IS NULL OR active_session IS NULL OR NOT EXISTS(
  SELECT 1 FROM web_auth.company_memberships m
  WHERE m.user_id=actor AND m.company_id=target_company AND m.role IN('Owner','Admin') AND m.status='active'
 ) THEN RETURN false; END IF;
 SELECT s.company_id INTO selected_company
 FROM saas.company_selections s WHERE s.session_id=active_session FOR SHARE;
 RETURN selected_company IS NOT DISTINCT FROM target_company;
END $$;
CREATE POLICY module_review_initializer_purposes ON invoice_routing.purposes FOR SELECT TO vtv_saas_owner
 USING(invoice_routing.module_review_initializer_scope(company_id,current_setting('app.module_review_initializer_module',true))
  AND ((current_setting('app.module_review_initializer_module',true)='vat' AND purpose IN('vat','both'))
    OR (current_setting('app.module_review_initializer_module',true)='ors' AND purpose IN('ors','both'))));
CREATE FUNCTION invoice_routing.initialize_module_reviews(target_company uuid,target_module text)
RETURNS TABLE(document_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_row record; inserted_id uuid; actor uuid;
BEGIN
 IF target_module IS NULL OR target_module NOT IN('vat','ors') THEN RAISE EXCEPTION 'Module review permission required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.module_review_initializer_module',target_module,true);
 IF NOT invoice_routing.module_review_initializer_scope(target_company,target_module) THEN
  RAISE EXCEPTION 'Selected company administrator and module permission required' USING ERRCODE='42501';
 END IF;
 actor:=saas.current_actor();
 FOR source_row IN
  SELECT p.document_id FROM invoice_routing.purposes p
  WHERE p.company_id=target_company
   AND ((target_module='vat' AND p.purpose IN('vat','both'))
     OR (target_module='ors' AND p.purpose IN('ors','both')))
  ORDER BY p.document_id FOR UPDATE OF p
 LOOP
  INSERT INTO invoice_routing.module_reviews(company_id,document_id,module,state,version,updated_by)
  VALUES(target_company,source_row.document_id,target_module,'pending',1,actor)
  ON CONFLICT(company_id,document_id,module) DO NOTHING
  RETURNING invoice_routing.module_reviews.document_id INTO inserted_id;
  IF FOUND THEN document_id:=inserted_id; RETURN NEXT; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION invoice_routing.module_review_initializer_scope(uuid,text),
 invoice_routing.initialize_module_reviews(uuid,text)
 FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION invoice_routing.initialize_module_reviews(uuid,text) TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

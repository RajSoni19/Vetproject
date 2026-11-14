-- REVIEW ONLY. Requires separate exact-file approval before execution.
-- Adds independent VAT and ORS review state for one canonical routed document.
-- Never creates an invoice, purchase order, receipt, stock movement or preview.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('invoice_routing.purposes') IS NULL
 OR to_regclass('invoice_routing.module_reviews') IS NOT NULL
 OR to_regclass('invoice_routing.module_review_events') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved module-review migration target/state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE TABLE invoice_routing.module_reviews(
 company_id uuid NOT NULL, document_id uuid NOT NULL,
 module text NOT NULL CHECK(module IN('vat','ors')),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','in_review','reviewed','rejected','withdrawn')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,document_id,module),
 FOREIGN KEY(company_id,document_id) REFERENCES invoice_routing.purposes(company_id,document_id)
);
CREATE TABLE invoice_routing.module_review_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, document_id uuid NOT NULL,
 module text NOT NULL CHECK(module IN('vat','ors')),
 previous_state text CHECK(previous_state IS NULL OR previous_state IN('pending','in_review','reviewed','rejected','withdrawn')),
 state text NOT NULL CHECK(state IN('pending','in_review','reviewed','rejected','withdrawn')),
 version bigint NOT NULL CHECK(version>0), actor_id uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,document_id,module) REFERENCES invoice_routing.module_reviews(company_id,document_id,module),
 UNIQUE(company_id,document_id,module,version)
);
ALTER TABLE invoice_routing.module_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.module_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.module_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.module_review_events FORCE ROW LEVEL SECURITY;
CREATE POLICY module_review_read ON invoice_routing.module_reviews FOR SELECT TO vtv_saas_runtime
 USING(saas.authorized_company(company_id,CASE module WHEN 'vat' THEN 'invoices:read' ELSE 'procurement:read' END));
CREATE POLICY module_review_update ON invoice_routing.module_reviews FOR UPDATE TO vtv_saas_runtime
 USING(saas.authorized_company(company_id,CASE module WHEN 'vat' THEN 'invoices:write' ELSE 'procurement:write' END))
 WITH CHECK(saas.authorized_company(company_id,CASE module WHEN 'vat' THEN 'invoices:write' ELSE 'procurement:write' END));
CREATE POLICY module_review_owner ON invoice_routing.module_reviews FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY module_review_event_read ON invoice_routing.module_review_events FOR SELECT TO vtv_saas_runtime
 USING(saas.authorized_company(company_id,CASE module WHEN 'vat' THEN 'invoices:read' ELSE 'procurement:read' END));
CREATE POLICY module_review_event_owner ON invoice_routing.module_review_events FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE FUNCTION invoice_routing.guard_module_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE required_read text; required_write text;
BEGIN
 required_read:=CASE NEW.module WHEN 'vat' THEN 'invoices:read' ELSE 'procurement:read' END;
 required_write:=CASE NEW.module WHEN 'vat' THEN 'invoices:write' ELSE 'procurement:write' END;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.module IS DISTINCT FROM OLD.module
 OR NEW.version<>OLD.version+1 OR NEW.updated_by IS DISTINCT FROM saas.current_actor()
 THEN RAISE EXCEPTION 'Module review authorization or version conflict' USING ERRCODE='42501'; END IF;
 IF pg_trigger_depth()<=1 AND (NOT saas.authorized_company(NEW.company_id,required_read) OR NOT saas.authorized_company(NEW.company_id,required_write))
 THEN RAISE EXCEPTION 'Module review permission required' USING ERRCODE='42501'; END IF;
 IF NOT ((OLD.state='pending' AND NEW.state IN('in_review','rejected','withdrawn'))
 OR (OLD.state='in_review' AND NEW.state IN('pending','reviewed','rejected','withdrawn'))
 OR (OLD.state='rejected' AND NEW.state IN('pending','withdrawn'))
 OR (OLD.state='reviewed' AND NEW.state='withdrawn')
 OR (OLD.state='withdrawn' AND NEW.state='pending'))
 THEN RAISE EXCEPTION 'Invalid module review transition' USING ERRCODE='23514'; END IF;
 IF NEW.state='reviewed' AND NOT EXISTS(
  SELECT 1 FROM saas.documents d JOIN saas.document_inspections i ON i.company_id=d.company_id AND i.document_id=d.id
   AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean'
  WHERE d.company_id=NEW.company_id AND d.id=NEW.document_id AND d.state='clean'
 ) THEN RAISE EXCEPTION 'Trusted inspection is required before review completion' USING ERRCODE='42501'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE FUNCTION invoice_routing.record_module_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO invoice_routing.module_review_events(company_id,document_id,module,previous_state,state,version,actor_id)
 VALUES(NEW.company_id,NEW.document_id,NEW.module,CASE WHEN TG_OP='UPDATE' THEN OLD.state ELSE NULL END,NEW.state,NEW.version,NEW.updated_by);
 RETURN NEW;
END $$;
CREATE FUNCTION invoice_routing.sync_module_reviews() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=saas.current_actor();
BEGIN
 IF NEW.purpose IN('vat','both') THEN
  INSERT INTO invoice_routing.module_reviews(company_id,document_id,module,state,version,updated_by)
  VALUES(NEW.company_id,NEW.document_id,'vat','pending',1,actor)
  ON CONFLICT(company_id,document_id,module) DO UPDATE SET state='pending',version=invoice_routing.module_reviews.version+1,updated_by=actor,updated_at=clock_timestamp()
   WHERE invoice_routing.module_reviews.state='withdrawn';
 ELSE
  UPDATE invoice_routing.module_reviews SET state='withdrawn',version=version+1,updated_by=actor,updated_at=clock_timestamp()
   WHERE company_id=NEW.company_id AND document_id=NEW.document_id AND module='vat' AND state<>'withdrawn';
 END IF;
 IF NEW.purpose IN('ors','both') THEN
  INSERT INTO invoice_routing.module_reviews(company_id,document_id,module,state,version,updated_by)
  VALUES(NEW.company_id,NEW.document_id,'ors','pending',1,actor)
  ON CONFLICT(company_id,document_id,module) DO UPDATE SET state='pending',version=invoice_routing.module_reviews.version+1,updated_by=actor,updated_at=clock_timestamp()
   WHERE invoice_routing.module_reviews.state='withdrawn';
 ELSE
  UPDATE invoice_routing.module_reviews SET state='withdrawn',version=version+1,updated_by=actor,updated_at=clock_timestamp()
   WHERE company_id=NEW.company_id AND document_id=NEW.document_id AND module='ors' AND state<>'withdrawn';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_module_review BEFORE UPDATE ON invoice_routing.module_reviews FOR EACH ROW EXECUTE FUNCTION invoice_routing.guard_module_review();
CREATE TRIGGER record_module_review AFTER INSERT OR UPDATE ON invoice_routing.module_reviews FOR EACH ROW EXECUTE FUNCTION invoice_routing.record_module_review();
CREATE TRIGGER sync_module_reviews AFTER INSERT OR UPDATE OF purpose ON invoice_routing.purposes FOR EACH ROW EXECUTE FUNCTION invoice_routing.sync_module_reviews();
CREATE TRIGGER immutable_module_review_events BEFORE UPDATE OR DELETE ON invoice_routing.module_review_events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
INSERT INTO invoice_routing.module_reviews(company_id,document_id,module,state,version,updated_by)
 SELECT p.company_id,p.document_id,'vat','pending',1,p.updated_by FROM invoice_routing.purposes p WHERE p.purpose IN('vat','both')
 UNION ALL
 SELECT p.company_id,p.document_id,'ors','pending',1,p.updated_by FROM invoice_routing.purposes p WHERE p.purpose IN('ors','both');
REVOKE ALL ON invoice_routing.module_reviews,invoice_routing.module_review_events FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE ALL ON FUNCTION invoice_routing.guard_module_review(),invoice_routing.record_module_review(),invoice_routing.sync_module_reviews() FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT USAGE ON SCHEMA invoice_routing TO vtv_saas_runtime;
GRANT SELECT,UPDATE ON invoice_routing.module_reviews TO vtv_saas_runtime;
GRANT SELECT ON invoice_routing.module_review_events TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

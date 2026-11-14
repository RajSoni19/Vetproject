-- REVIEW ONLY. No execution without separate exact-file approval.
-- Purpose metadata only: no stock, invoice confirmation, VAT claim or email.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.documents') IS NULL OR to_regnamespace('invoice_routing') IS NOT NULL THEN RAISE EXCEPTION 'Unapproved routing target';END IF;
END $$;
CREATE SCHEMA invoice_routing AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA invoice_routing REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA invoice_routing REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE invoice_routing.purposes(
 company_id uuid NOT NULL,document_id uuid NOT NULL,purpose text NOT NULL CHECK(purpose IN('ors','vat','both')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),updated_by uuid NOT NULL REFERENCES web_auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,document_id),FOREIGN KEY(company_id,document_id) REFERENCES saas.documents(company_id,id));
CREATE TABLE invoice_routing.events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,document_id uuid NOT NULL,
 previous_purpose text,purpose text NOT NULL,version bigint NOT NULL,actor_id uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,document_id) REFERENCES invoice_routing.purposes(company_id,document_id),UNIQUE(company_id,document_id,version));
ALTER TABLE invoice_routing.purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.purposes FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_routing.events FORCE ROW LEVEL SECURITY;
CREATE POLICY purpose_read ON invoice_routing.purposes FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:read'));
CREATE POLICY purpose_insert ON invoice_routing.purposes FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,'documents:write'));
CREATE POLICY purpose_update ON invoice_routing.purposes FOR UPDATE TO vtv_saas_runtime USING(business.scope(company_id,'documents:write')) WITH CHECK(business.scope(company_id,'documents:write'));
CREATE POLICY event_read ON invoice_routing.events FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,'documents:read'));
CREATE POLICY owner_events ON invoice_routing.events TO vtv_saas_owner USING(true) WITH CHECK(true);
CREATE FUNCTION invoice_routing.validate_purpose() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT business.scope(NEW.company_id,'documents:write') OR NEW.updated_by IS DISTINCT FROM saas.current_actor()
 OR NOT saas.authorized_company(NEW.company_id,'documents:read') THEN RAISE EXCEPTION 'Document routing permission required' USING ERRCODE='42501';END IF;
 IF NEW.purpose IN('ors','both') AND NOT saas.authorized_company(NEW.company_id,'procurement:write') THEN RAISE EXCEPTION 'ORS write permission required' USING ERRCODE='42501';END IF;
 IF NEW.purpose IN('vat','both') AND NOT saas.authorized_company(NEW.company_id,'invoices:write') THEN RAISE EXCEPTION 'VAT invoice write permission required' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Routing identity/version conflict' USING ERRCODE='23505';END IF;
 ELSIF NEW.version<>1 THEN RAISE EXCEPTION 'Initial routing version required' USING ERRCODE='23505';END IF;
 NEW.updated_at=clock_timestamp();RETURN NEW;
END $$;
CREATE FUNCTION invoice_routing.record_purpose() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO invoice_routing.events(company_id,document_id,previous_purpose,purpose,version,actor_id)
 VALUES(NEW.company_id,NEW.document_id,CASE WHEN TG_OP='UPDATE' THEN OLD.purpose ELSE NULL END,NEW.purpose,NEW.version,NEW.updated_by);
 RETURN NEW;
END $$;
CREATE TRIGGER validate_purpose BEFORE INSERT OR UPDATE ON invoice_routing.purposes FOR EACH ROW EXECUTE FUNCTION invoice_routing.validate_purpose();
CREATE TRIGGER record_purpose AFTER INSERT OR UPDATE ON invoice_routing.purposes FOR EACH ROW EXECUTE FUNCTION invoice_routing.record_purpose();
CREATE TRIGGER immutable_route_events BEFORE UPDATE OR DELETE ON invoice_routing.events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
REVOKE ALL ON ALL TABLES IN SCHEMA invoice_routing FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA invoice_routing FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT USAGE ON SCHEMA invoice_routing TO vtv_saas_runtime;
GRANT SELECT,INSERT,UPDATE ON invoice_routing.purposes TO vtv_saas_runtime;
GRANT SELECT ON invoice_routing.events TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

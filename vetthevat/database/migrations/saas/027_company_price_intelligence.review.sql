-- REVIEW ONLY. Company-only price matching; no cross-company publication grant.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('invoice_routing.purposes') IS NULL OR to_regnamespace('price_intelligence') IS NOT NULL THEN RAISE EXCEPTION 'Unapproved price intelligence target';END IF;
END $$;
CREATE SCHEMA price_intelligence AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;
ALTER DEFAULT PRIVILEGES IN SCHEMA price_intelligence REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA price_intelligence REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE price_intelligence.products(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES web_auth.companies(id),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 variant text NOT NULL CHECK(length(trim(variant)) BETWEEN 1 AND 200),unit text NOT NULL CHECK(unit IN('kg','l','each')),gtin text CHECK(gtin~'^(\d{8}|\d{12}|\d{13}|\d{14})$'),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id),UNIQUE(company_id,name,variant,unit));
CREATE TABLE price_intelligence.aliases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,supplier_id uuid NOT NULL,description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),
 product_id uuid NOT NULL,items_per_pack numeric(15,6) NOT NULL CHECK(items_per_pack>0 AND items_per_pack<1000000000),content_per_item numeric(15,6) NOT NULL CHECK(content_per_item>0 AND content_per_item<1000000000),
 unit text NOT NULL CHECK(unit IN('g','kg','ml','l','each')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),reviewed_by uuid NOT NULL REFERENCES web_auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),FOREIGN KEY(company_id,product_id) REFERENCES price_intelligence.products(company_id,id),UNIQUE(company_id,supplier_id,description),UNIQUE(company_id,id));
CREATE TABLE price_intelligence.line_matches(
 company_id uuid NOT NULL,line_id uuid NOT NULL,invoice_id uuid NOT NULL,product_id uuid NOT NULL,
 items_per_pack numeric(15,6) NOT NULL CHECK(items_per_pack>0 AND items_per_pack<1000000000),content_per_item numeric(15,6) NOT NULL CHECK(content_per_item>0 AND content_per_item<1000000000),unit text NOT NULL CHECK(unit IN('g','kg','ml','l','each')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),reviewed_by uuid NOT NULL REFERENCES web_auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,line_id),FOREIGN KEY(company_id,invoice_id,line_id) REFERENCES business.invoice_lines(company_id,invoice_id,id),FOREIGN KEY(company_id,product_id) REFERENCES price_intelligence.products(company_id,id));
CREATE TABLE price_intelligence.consent(
 company_id uuid PRIMARY KEY REFERENCES web_auth.companies(id),participation_requested boolean NOT NULL DEFAULT false,
 policy_version text NOT NULL CHECK(policy_version='local-price-intent-1'),version bigint NOT NULL DEFAULT 1 CHECK(version>0),recorded_by uuid NOT NULL REFERENCES web_auth.users(id),updated_at timestamptz NOT NULL DEFAULT now());
-- This records a preference only. No aggregate worker, cross-tenant grant or
-- publication function is installed. Withdrawal affects the next company read.
CREATE TABLE price_intelligence.commands(
 company_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES web_auth.users(id),key_hash char(64) NOT NULL CHECK(key_hash~'^[a-f0-9]{64}$'),payload_hash char(64) NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),response jsonb,
 PRIMARY KEY(company_id,actor_id,key_hash));
CREATE TABLE price_intelligence.events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL,entity text NOT NULL,actor_id uuid NOT NULL REFERENCES web_auth.users(id),previous jsonb,current_value jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION price_intelligence.validate_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE base text;source business.invoices;BEGIN
 IF TG_TABLE_NAME='consent' THEN
  IF NOT business.scope(NEW.company_id,'company:manage') OR NEW.recorded_by IS DISTINCT FROM saas.current_actor() THEN RAISE EXCEPTION 'Company management required' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT business.scope(NEW.company_id,'invoices:read') OR NOT saas.authorized_company(NEW.company_id,'procurement:approve') THEN RAISE EXCEPTION 'Invoice and procurement approval required' USING ERRCODE='42501';END IF;
  IF TG_TABLE_NAME='products' THEN
   IF NEW.created_by IS DISTINCT FROM saas.current_actor() THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501';END IF;
   RETURN NEW;
  ELSE
   IF NEW.reviewed_by IS DISTINCT FROM saas.current_actor() THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501';END IF;
   SELECT unit INTO base FROM price_intelligence.products WHERE company_id=NEW.company_id AND id=NEW.product_id;
   IF base IS DISTINCT FROM CASE WHEN NEW.unit IN('g','kg') THEN 'kg' WHEN NEW.unit IN('ml','l') THEN 'l' ELSE 'each' END
    OR NEW.unit='each' AND (NEW.items_per_pack<>trunc(NEW.items_per_pack) OR NEW.content_per_item<>trunc(NEW.content_per_item)) THEN RAISE EXCEPTION 'Incompatible product normalization' USING ERRCODE='22023';END IF;
   IF TG_TABLE_NAME='line_matches' THEN
    SELECT * INTO source FROM business.invoices WHERE company_id=NEW.company_id AND id=NEW.invoice_id;
    IF source.id IS NULL OR source.state<>'confirmed' OR source.direction<>'purchase' OR source.kind<>'invoice'
      OR EXISTS(SELECT 1 FROM business.invoices WHERE company_id=NEW.company_id AND credit_for_id=source.id AND state='confirmed') THEN RAISE EXCEPTION 'Reviewed uncredited purchase invoice required' USING ERRCODE='22023';END IF;
    IF NEW.unit='each' AND EXISTS(SELECT 1 FROM business.invoice_lines WHERE company_id=NEW.company_id AND id=NEW.line_id AND quantity<>trunc(quantity)) THEN RAISE EXCEPTION 'Integral item count required' USING ERRCODE='22023';END IF;
   ELSE
    IF NOT EXISTS(SELECT 1 FROM business.counterparties WHERE company_id=NEW.company_id AND id=NEW.supplier_id AND kind='supplier') THEN RAISE EXCEPTION 'Owned supplier required' USING ERRCODE='42501';END IF;
   END IF;
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Current version required' USING ERRCODE='23505';END IF;
  IF TG_TABLE_NAME='line_matches' THEN
   IF NEW.line_id IS DISTINCT FROM OLD.line_id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN RAISE EXCEPTION 'Source identity immutable' USING ERRCODE='23505';END IF;
  END IF;
  IF TG_TABLE_NAME='aliases' THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.description IS DISTINCT FROM OLD.description THEN RAISE EXCEPTION 'Alias identity immutable' USING ERRCODE='23505';END IF;
  END IF;
  NEW.updated_at=clock_timestamp();
 ELSIF TG_TABLE_NAME<>'products' AND NEW.version<>1 THEN RAISE EXCEPTION 'Initial version required' USING ERRCODE='23505';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION price_intelligence.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO price_intelligence.events(company_id,entity,actor_id,previous,current_value) VALUES(NEW.company_id,TG_TABLE_NAME,saas.current_actor(),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['products','aliases','line_matches','consent','commands','events'] LOOP
 EXECUTE format('ALTER TABLE price_intelligence.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE price_intelligence.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY owner_access ON price_intelligence.%I TO vtv_saas_owner USING(true) WITH CHECK(true)',t);
 IF t IN('products','aliases','line_matches','events') THEN
  EXECUTE format('CREATE POLICY company_read ON price_intelligence.%I FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,''procurement:read'') AND (business.scope(company_id,''reports:read'') OR business.scope(company_id,''reports:export'') OR business.scope(company_id,''invoices:read'')))',t);
 ELSE
  EXECUTE format('CREATE POLICY company_read ON price_intelligence.%I FOR SELECT TO vtv_saas_runtime USING(saas.authorized_company(company_id,''company:read'') AND %s)',t,CASE WHEN t='commands' THEN 'actor_id=saas.current_actor()' ELSE 'true' END);
 END IF;
 IF t NOT IN('events','commands') THEN
  EXECUTE format('CREATE TRIGGER validate_change BEFORE INSERT %s ON price_intelligence.%I FOR EACH ROW EXECUTE FUNCTION price_intelligence.validate_change()',CASE WHEN t='products' THEN '' ELSE 'OR UPDATE' END,t);
  EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT %s ON price_intelligence.%I FOR EACH ROW EXECUTE FUNCTION price_intelligence.audit_change()',CASE WHEN t='products' THEN '' ELSE 'OR UPDATE' END,t);
 END IF;
END LOOP;END $$;
CREATE POLICY catalog_insert ON price_intelligence.products FOR INSERT TO vtv_saas_runtime WITH CHECK(business.scope(company_id,'invoices:read') AND saas.authorized_company(company_id,'procurement:approve'));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['aliases','line_matches','consent','commands'] LOOP
 EXECUTE format('CREATE POLICY company_insert ON price_intelligence.%I FOR INSERT TO vtv_saas_runtime WITH CHECK(saas.authorized_company(company_id,''company:read''))',t);
 EXECUTE format('CREATE POLICY company_update ON price_intelligence.%I FOR UPDATE TO vtv_saas_runtime USING(saas.authorized_company(company_id,''company:read'')) WITH CHECK(saas.authorized_company(company_id,''company:read''))',t);
END LOOP;END $$;
-- Commands contain no financial authority; constrain their actor even for a
-- compromised runtime issuing SQL directly.
CREATE POLICY command_actor ON price_intelligence.commands AS RESTRICTIVE TO vtv_saas_runtime USING(actor_id=saas.current_actor()) WITH CHECK(actor_id=saas.current_actor());
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON price_intelligence.events FOR EACH ROW EXECUTE FUNCTION saas.reject_immutable_change();
REVOKE ALL ON ALL TABLES IN SCHEMA price_intelligence FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA price_intelligence FROM PUBLIC,vtv_web_runtime,vtv_saas_runtime;
GRANT USAGE ON SCHEMA price_intelligence TO vtv_saas_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA price_intelligence TO vtv_saas_runtime;
GRANT INSERT ON price_intelligence.products TO vtv_saas_runtime;
GRANT INSERT,UPDATE ON price_intelligence.aliases,price_intelligence.line_matches,price_intelligence.consent,price_intelligence.commands TO vtv_saas_runtime;
RESET ROLE;
COMMIT;

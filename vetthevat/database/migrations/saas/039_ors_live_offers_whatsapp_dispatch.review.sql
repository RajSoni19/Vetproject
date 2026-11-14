-- REVIEW ONLY. Never run during import, build, startup, or without exact approval.
-- Adds tenant-scoped verified supplier offers, verified WhatsApp contacts, and
-- a dispatch record that stays pending when a WhatsApp link is merely opened.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.shopping_supplier_groups') IS NULL
 OR to_regclass('operations.shopping_requisition_lines') IS NULL
 OR to_regclass('operations.shopping_units') IS NULL
 OR to_regclass('operations.shopping_supplier_products') IS NULL
 OR to_regclass('operations.shopping_supplier_offers') IS NOT NULL
 OR to_regclass('operations.shopping_supplier_whatsapp') IS NOT NULL
 OR to_regclass('operations.shopping_dispatches') IS NOT NULL
 OR to_regprocedure('operations.guard_shopping_dispatch_update()') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_owner' AND NOT(rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vtv_saas_runtime' AND rolcanlogin AND NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
 THEN RAISE EXCEPTION 'Unapproved target, missing shopping prerequisite, or existing marketplace schema'; END IF;
END $$;

SET LOCAL ROLE vtv_saas_owner;

CREATE TABLE operations.shopping_supplier_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 material_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 unit_code text NOT NULL,
 base_unit text NOT NULL,
 base_quantity_per_unit numeric(18,6) NOT NULL CHECK(base_quantity_per_unit>0),
 unit_price numeric(18,6) NOT NULL CHECK(unit_price>=0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 vat_rate numeric(5,2) NOT NULL CHECK(vat_rate BETWEEN 0 AND 100),
 price_includes_vat boolean NOT NULL,
 minimum_order_quantity numeric(18,4) NOT NULL CHECK(minimum_order_quantity>0),
 available_quantity numeric(18,4) CHECK(available_quantity IS NULL OR available_quantity>=0),
 availability_state text NOT NULL CHECK(availability_state IN('available','unavailable','unknown')),
 source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 1 AND 300),
 valid_until timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','withdrawn')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 verified_by uuid NOT NULL REFERENCES web_auth.users(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 UNIQUE(company_id,id,material_id,supplier_id,unit_code,base_unit,base_quantity_per_unit,currency),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,material_id,unit_code,base_unit,base_quantity_per_unit) REFERENCES operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit),
 CHECK((availability_state='unknown' AND available_quantity IS NULL)
 OR (availability_state='available' AND available_quantity IS NOT NULL AND available_quantity>0)
 OR (availability_state='unavailable' AND available_quantity IS NOT NULL AND available_quantity=0))
);
CREATE INDEX shopping_supplier_offers_current ON operations.shopping_supplier_offers(company_id,material_id,supplier_id,valid_until DESC) WHERE state='active';

CREATE TABLE operations.shopping_supplier_whatsapp(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 phone_e164 text NOT NULL CHECK(phone_e164~'^\+[1-9][0-9]{7,14}$'),
 verification_method text NOT NULL CHECK(verification_method IN('supplier_call','supplier_written_confirmation','official_whatsapp_business')),
 source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 1 AND 300),
 verified_by uuid NOT NULL REFERENCES web_auth.users(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES web_auth.users(id),
 revoked_at timestamptz,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE UNIQUE INDEX shopping_supplier_whatsapp_active ON operations.shopping_supplier_whatsapp(company_id,supplier_id) WHERE revoked_at IS NULL;

CREATE TABLE operations.shopping_dispatches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL,
 requisition_id uuid NOT NULL,
 supplier_group_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 order_reference text NOT NULL CHECK(order_reference~'^ORS-[A-Z0-9]{8,20}$'),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 subtotal numeric(18,6) NOT NULL CHECK(subtotal>=0),
 vat_amount numeric(18,6) NOT NULL CHECK(vat_amount>=0),
 total_amount numeric(18,6) NOT NULL CHECK(total_amount>=0),
 state text NOT NULL DEFAULT 'pending_dispatch' CHECK(state IN('pending_dispatch','awaiting_confirmation','delivered','accepted','cancelled')),
 created_by uuid NOT NULL REFERENCES web_auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 confirmed_by uuid REFERENCES web_auth.users(id),
 confirmed_at timestamptz,
 provider_event_id text,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 UNIQUE(company_id,id,currency),
 UNIQUE(company_id,id,supplier_id,currency),
 UNIQUE(company_id,order_reference),
 FOREIGN KEY(company_id,requisition_id) REFERENCES operations.shopping_requisitions(company_id,id),
 FOREIGN KEY(company_id,supplier_group_id) REFERENCES operations.shopping_supplier_groups(company_id,id),
 FOREIGN KEY(company_id,requisition_id,supplier_id) REFERENCES operations.shopping_supplier_groups(company_id,requisition_id,supplier_id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 CHECK(total_amount=subtotal+vat_amount),
 CHECK((confirmed_by IS NULL)=(confirmed_at IS NULL)),
 CHECK(state<>'pending_dispatch' OR (confirmed_by IS NULL AND provider_event_id IS NULL)),
 CHECK(state<>'awaiting_confirmation' OR confirmed_by IS NOT NULL),
 CHECK(state NOT IN('delivered','accepted') OR (provider_event_id IS NOT NULL AND length(btrim(provider_event_id)) BETWEEN 1 AND 200))
);
CREATE UNIQUE INDEX shopping_dispatch_active_group ON operations.shopping_dispatches(company_id,supplier_group_id) WHERE state<>'cancelled';
CREATE UNIQUE INDEX shopping_dispatch_provider_event ON operations.shopping_dispatches(company_id,provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX shopping_dispatch_status ON operations.shopping_dispatches(company_id,state,created_at DESC);

CREATE TABLE operations.shopping_dispatch_lines(
 company_id uuid NOT NULL,
 dispatch_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 1000),
 material_id uuid NOT NULL,
 offer_id uuid NOT NULL,
 supplier_id uuid NOT NULL,
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 product_name text NOT NULL CHECK(length(btrim(product_name)) BETWEEN 1 AND 200),
 sku text NOT NULL CHECK(length(btrim(sku)) BETWEEN 1 AND 80),
 quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 unit_code text NOT NULL,
 base_unit text NOT NULL,
 base_quantity_per_unit numeric(18,6) NOT NULL CHECK(base_quantity_per_unit>0),
 unit_price numeric(18,6) NOT NULL CHECK(unit_price>=0),
 vat_rate numeric(5,2) NOT NULL CHECK(vat_rate BETWEEN 0 AND 100),
 price_includes_vat boolean NOT NULL,
 subtotal numeric(18,6) NOT NULL CHECK(subtotal>=0),
 vat_amount numeric(18,6) NOT NULL CHECK(vat_amount>=0),
 total_amount numeric(18,6) NOT NULL CHECK(total_amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,dispatch_id,position),
 FOREIGN KEY(company_id,dispatch_id,supplier_id,currency) REFERENCES operations.shopping_dispatches(company_id,id,supplier_id,currency),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,offer_id,material_id,supplier_id,unit_code,base_unit,base_quantity_per_unit,currency) REFERENCES operations.shopping_supplier_offers(company_id,id,material_id,supplier_id,unit_code,base_unit,base_quantity_per_unit,currency),
 FOREIGN KEY(company_id,material_id,unit_code,base_unit,base_quantity_per_unit) REFERENCES operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit),
 CHECK(total_amount=subtotal+vat_amount)
);

CREATE FUNCTION operations.guard_shopping_dispatch_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id
 OR NEW.requisition_id IS DISTINCT FROM OLD.requisition_id
 OR NEW.supplier_group_id IS DISTINCT FROM OLD.supplier_group_id
 OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
 OR NEW.order_reference IS DISTINCT FROM OLD.order_reference
 OR NEW.currency IS DISTINCT FROM OLD.currency
 OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
 OR NEW.vat_amount IS DISTINCT FROM OLD.vat_amount
 OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
 OR NEW.created_by IS DISTINCT FROM OLD.created_by
 OR NEW.created_at IS DISTINCT FROM OLD.created_at
 THEN RAISE EXCEPTION 'Shopping dispatch identity is immutable'; END IF;
 IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
  IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
  OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
  OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
  OR NEW.version IS DISTINCT FROM OLD.version
  OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
  THEN RAISE EXCEPTION 'Dispatch confirmation requires an explicit state transition'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state='pending_dispatch' AND NEW.state='awaiting_confirmation' THEN
  NEW.confirmed_by=saas.current_actor();
  NEW.confirmed_at=now();
 ELSIF OLD.state IN('pending_dispatch','awaiting_confirmation','delivered') AND NEW.state IN('delivered','accepted') THEN
  IF NEW.provider_event_id IS NULL OR NEW.provider_event_id=OLD.provider_event_id THEN
   RAISE EXCEPTION 'A new authorized delivery event is required';
  END IF;
 ELSIF OLD.state IN('pending_dispatch','awaiting_confirmation') AND NEW.state='cancelled' THEN
  IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
  OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
  OR NEW.provider_event_id IS DISTINCT FROM OLD.provider_event_id
  THEN RAISE EXCEPTION 'Cancellation cannot create a dispatch confirmation'; END IF;
 ELSE
  RAISE EXCEPTION 'Invalid shopping dispatch state transition';
 END IF;
 NEW.version=OLD.version+1;
 NEW.updated_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER shopping_dispatch_update_guard BEFORE UPDATE ON operations.shopping_dispatches FOR EACH ROW EXECUTE FUNCTION operations.guard_shopping_dispatch_update();

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['shopping_supplier_offers','shopping_supplier_whatsapp','shopping_dispatches','shopping_dispatch_lines'] LOOP
  EXECUTE format('ALTER TABLE operations.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE operations.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY shopping_marketplace_owner_all ON operations.%I FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true)',table_name);
 END LOOP;
END $$;

CREATE POLICY shopping_supplier_offer_read ON operations.shopping_supplier_offers FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_supplier_offer_write ON operations.shopping_supplier_offers FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:approve')) WITH CHECK(operations.allowed(company_id,'procurement:approve') AND verified_by=saas.current_actor());
CREATE POLICY shopping_supplier_whatsapp_read ON operations.shopping_supplier_whatsapp FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_supplier_whatsapp_write ON operations.shopping_supplier_whatsapp FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:approve')) WITH CHECK(operations.allowed(company_id,'procurement:approve') AND verified_by=saas.current_actor());
CREATE POLICY shopping_dispatch_read ON operations.shopping_dispatches FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_dispatch_insert ON operations.shopping_dispatches FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'procurement:write') AND created_by=saas.current_actor() AND state='pending_dispatch');
CREATE POLICY shopping_dispatch_update ON operations.shopping_dispatches FOR UPDATE TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:write')) WITH CHECK(operations.allowed(company_id,'procurement:write') AND state IN('pending_dispatch','awaiting_confirmation','cancelled'));
CREATE POLICY shopping_dispatch_line_read ON operations.shopping_dispatch_lines FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_dispatch_line_insert ON operations.shopping_dispatch_lines FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'procurement:write') AND EXISTS(SELECT 1 FROM operations.shopping_dispatches d WHERE d.company_id=shopping_dispatch_lines.company_id AND d.id=shopping_dispatch_lines.dispatch_id AND d.state='pending_dispatch'));

GRANT SELECT,INSERT,UPDATE ON operations.shopping_supplier_offers,operations.shopping_supplier_whatsapp,operations.shopping_dispatches TO vtv_saas_runtime;
GRANT SELECT,INSERT ON operations.shopping_dispatch_lines TO vtv_saas_runtime;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE operations.shopping_supplier_offers,operations.shopping_supplier_whatsapp,operations.shopping_dispatches,operations.shopping_dispatch_lines FROM PUBLIC,vtv_web_runtime;
REVOKE ALL ON TABLE operations.shopping_supplier_offers,operations.shopping_supplier_whatsapp,operations.shopping_dispatches,operations.shopping_dispatch_lines FROM vtv_web_runtime,vtv_saas_provider_runtime;
REVOKE ALL ON FUNCTION operations.guard_shopping_dispatch_update() FROM PUBLIC,vtv_saas_runtime,vtv_web_runtime,vtv_saas_provider_runtime;

COMMENT ON TABLE operations.shopping_supplier_offers IS 'Tenant-scoped, manager-verified current supplier quotations; offers expire and are never inferred from historical invoices.';
COMMENT ON TABLE operations.shopping_supplier_whatsapp IS 'Tenant-scoped supplier WhatsApp numbers with recorded independent verification and revocation.';
COMMENT ON TABLE operations.shopping_dispatches IS 'One supplier-group order draft and explicit dispatch confirmation state; opening a WhatsApp link does not change state.';
COMMENT ON TABLE operations.shopping_dispatch_lines IS 'Immutable priced product, VAT, quantity and amount snapshots for a supplier-group dispatch draft.';
COMMENT ON COLUMN operations.shopping_supplier_offers.source_reference IS 'Reference to supplier-provided quote evidence; never a public file URL.';
COMMENT ON COLUMN operations.shopping_supplier_whatsapp.verification_method IS 'Company-recorded verification method; this field alone does not imply a WhatsApp API integration.';
COMMENT ON COLUMN operations.shopping_dispatches.provider_event_id IS 'Authorized WhatsApp Business delivery event identifier, when an official integration exists.';

COMMIT;

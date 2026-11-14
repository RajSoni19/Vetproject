-- REVIEW ONLY. Never run during import, build, startup, or without exact approval.
-- Adds persisted ORS carts, multi-supplier requisitions, buyer assignment,
-- configured catalogue metadata/conversions, and actual-purchase reconciliation.
-- Purchase receipts remain the only path that posts inventory movements.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('saas.trial_history') IS NULL
 OR to_regclass('operations.materials') IS NULL
 OR to_regclass('operations.purchase_requests') IS NULL
 OR to_regclass('operations.purchase_request_lines') IS NULL
 OR to_regclass('operations.purchase_orders') IS NULL
 OR to_regclass('operations.purchase_order_lines') IS NULL
 OR to_regclass('operations.goods_receipts') IS NULL
 OR to_regclass('operations.inventory_movements') IS NULL
 OR to_regclass('price_intelligence.products') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check' AND contype='c')
 OR to_regclass('operations.shopping_requisitions') IS NOT NULL
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite, or existing shopping schema'; END IF;
END $$;

-- Temporary constraint-definition privilege, revoked immediately below.
GRANT REFERENCES(user_id,company_id) ON web_auth.company_memberships TO vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;

-- Materials remain the canonical company inventory identities. Catalogue rows
-- are deliberately unlisted until a company buyer reviews them. No image, category,
-- supplier, availability or price is invented by this backfill.
CREATE TABLE operations.shopping_catalogue(
 company_id uuid NOT NULL,
 material_id uuid NOT NULL,
 category text NOT NULL DEFAULT 'Other' CHECK(length(btrim(category)) BETWEEN 1 AND 80),
 image_path text CHECK(image_path IS NULL OR image_path~'^/ors/catalogue/[A-Za-z0-9_-]+\.(svg|webp|png|jpg)$'),
 price_product_id uuid,
 listed boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid REFERENCES web_auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,material_id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,price_product_id) REFERENCES price_intelligence.products(company_id,id)
);
INSERT INTO operations.shopping_catalogue(company_id,material_id)
 SELECT company_id,id FROM operations.materials;

-- A quantity conversion is explicit and stored in the material's existing stock
-- unit. Only exact EA -> pcs and KG -> kg base conversions are seeded. Box sizes
-- must be configured from pack evidence by an authorized buyer.
CREATE TABLE operations.shopping_units(
 company_id uuid NOT NULL, material_id uuid NOT NULL,
 unit_code text NOT NULL CHECK(unit_code IN('pcs','kg','g','l','box')),
 base_unit text NOT NULL CHECK(base_unit~'^[A-Z0-9][A-Z0-9._/-]{0,15}$'),
 base_quantity_per_unit numeric(18,6) NOT NULL CHECK(base_quantity_per_unit>0),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,material_id,unit_code),
 UNIQUE(company_id,material_id,unit_code,base_unit,base_quantity_per_unit),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id)
);
INSERT INTO operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit,updated_by)
 SELECT company_id,id,'pcs',unit,1,created_by FROM operations.materials WHERE upper(unit)='EA'
 UNION ALL
 SELECT company_id,id,'kg',unit,1,created_by FROM operations.materials WHERE upper(unit)='KG';

-- This is a buyer-confirmed or previously ordered supplier association, never
-- a live availability assertion. Linked historical prices remain explicitly
-- historical invoice evidence and are not supplier quotations.
CREATE TABLE operations.shopping_supplier_products(
 company_id uuid NOT NULL, material_id uuid NOT NULL, supplier_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN('historical_order','manager_confirmed')),
 supplier_product_name text CHECK(supplier_product_name IS NULL OR length(btrim(supplier_product_name)) BETWEEN 1 AND 200),
 supplier_sku text CHECK(supplier_sku IS NULL OR length(supplier_sku)<=80),
 price_product_id uuid,
 active boolean NOT NULL DEFAULT true,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,material_id,supplier_id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,price_product_id) REFERENCES price_intelligence.products(company_id,id)
);
INSERT INTO operations.shopping_supplier_products(company_id,material_id,supplier_id,source,updated_by)
 SELECT DISTINCT r.company_id,l.material_id,r.supplier_id,'historical_order',r.created_by
 FROM operations.purchase_orders p
 JOIN operations.purchase_requests r ON r.company_id=p.company_id AND r.id=p.request_id
 JOIN operations.purchase_request_lines l ON l.company_id=r.company_id AND l.request_id=r.id
 JOIN business.counterparties c ON c.company_id=r.company_id AND c.id=r.supplier_id AND c.kind='supplier' AND c.status='active'
 ON CONFLICT(company_id,material_id,supplier_id) DO NOTHING;

CREATE TABLE operations.shopping_requisitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 requested_by uuid NOT NULL, assigned_buyer_id uuid,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','accepted','purchasing','partially_purchased','purchased','delivered','cancelled')),
 required_on date, priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 instructions text CHECK(instructions IS NULL OR length(instructions)<=2000),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id),
 FOREIGN KEY(requested_by,company_id) REFERENCES web_auth.company_memberships(user_id,company_id),
 FOREIGN KEY(assigned_buyer_id,company_id) REFERENCES web_auth.company_memberships(user_id,company_id)
);
RESET ROLE;
REVOKE REFERENCES(user_id,company_id) ON web_auth.company_memberships FROM vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;

CREATE UNIQUE INDEX shopping_one_open_cart_per_requester ON operations.shopping_requisitions(company_id,requested_by) WHERE state='draft';
CREATE INDEX shopping_buyer_inbox ON operations.shopping_requisitions(company_id,assigned_buyer_id,created_at DESC) WHERE state IN('accepted','purchasing','partially_purchased','purchased');

CREATE TABLE operations.shopping_supplier_groups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, requisition_id uuid NOT NULL,
 supplier_id uuid NOT NULL, state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','accepted','purchasing','partially_purchased','purchased','delivered','cancelled')),
 purchase_request_id uuid, purchase_order_id uuid,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,requisition_id,supplier_id),
 FOREIGN KEY(company_id,requisition_id) REFERENCES operations.shopping_requisitions(company_id,id),
 FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id),
 FOREIGN KEY(company_id,purchase_request_id) REFERENCES operations.purchase_requests(company_id,id),
 FOREIGN KEY(company_id,purchase_order_id) REFERENCES operations.purchase_orders(company_id,id)
);

CREATE TABLE operations.shopping_requisition_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, supplier_group_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 500), material_id uuid NOT NULL,
 requested_quantity numeric(18,4) NOT NULL CHECK(requested_quantity>0), requested_unit text NOT NULL CHECK(requested_unit IN('pcs','kg','g','l','box')),
 requested_base_unit text NOT NULL, requested_base_quantity_per_unit numeric(18,6) NOT NULL CHECK(requested_base_quantity_per_unit>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','purchased','unavailable','removed')),
 actual_material_id uuid, actual_quantity numeric(18,4), actual_unit text CHECK(actual_unit IS NULL OR actual_unit IN('pcs','kg','g','l','box')),
 actual_base_unit text, actual_base_quantity_per_unit numeric(18,6), actual_unit_price numeric(18,4) CHECK(actual_unit_price IS NULL OR actual_unit_price>=0),
 actual_currency char(3) CHECK(actual_currency IS NULL OR actual_currency IN('GBP','EUR','USD')),
 substitution_note text CHECK(substitution_note IS NULL OR length(substitution_note)<=500),
 requester_note text CHECK(requester_note IS NULL OR length(requester_note)<=500),
 buyer_note text CHECK(buyer_note IS NULL OR length(buyer_note)<=1000),
 updated_by uuid NOT NULL REFERENCES web_auth.users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,supplier_group_id,position),
 FOREIGN KEY(company_id,supplier_group_id) REFERENCES operations.shopping_supplier_groups(company_id,id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,actual_material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,material_id,requested_unit,requested_base_unit,requested_base_quantity_per_unit)
  REFERENCES operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit),
 FOREIGN KEY(company_id,actual_material_id,actual_unit,actual_base_unit,actual_base_quantity_per_unit)
  REFERENCES operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit),
 CHECK((state IN('pending','removed') AND actual_material_id IS NULL AND actual_quantity IS NULL AND actual_unit IS NULL AND actual_base_unit IS NULL AND actual_base_quantity_per_unit IS NULL AND actual_unit_price IS NULL AND actual_currency IS NULL)
    OR (state='unavailable' AND actual_material_id IS NULL AND actual_quantity IS NULL AND actual_unit IS NULL AND actual_base_unit IS NULL AND actual_base_quantity_per_unit IS NULL)
    OR (state='purchased' AND actual_material_id IS NOT NULL AND actual_quantity>0 AND actual_unit IS NOT NULL AND actual_base_unit IS NOT NULL AND actual_base_quantity_per_unit>0)),
 CHECK(actual_material_id IS NULL OR actual_material_id=material_id OR length(btrim(coalesce(substitution_note,'')))>=3)
);

CREATE TABLE operations.shopping_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
 requisition_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES web_auth.users(id),
 action text NOT NULL CHECK(length(action) BETWEEN 1 AND 80),
 details jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(details)='object'), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,requisition_id) REFERENCES operations.shopping_requisitions(company_id,id)
);
CREATE INDEX shopping_events_timeline ON operations.shopping_events(company_id,requisition_id,created_at,id);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['shopping_catalogue','shopping_units','shopping_supplier_products','shopping_requisitions','shopping_supplier_groups','shopping_requisition_lines','shopping_events'] LOOP
  EXECUTE format('ALTER TABLE operations.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE operations.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY shopping_owner_all ON operations.%I FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true)',table_name);
 END LOOP;
END $$;

CREATE POLICY shopping_catalogue_read ON operations.shopping_catalogue FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_catalogue_write ON operations.shopping_catalogue FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:approve')) WITH CHECK(operations.allowed(company_id,'procurement:approve'));
CREATE POLICY shopping_units_read ON operations.shopping_units FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_units_write ON operations.shopping_units FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:approve')) WITH CHECK(operations.allowed(company_id,'procurement:approve'));
CREATE POLICY shopping_supplier_products_read ON operations.shopping_supplier_products FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_supplier_products_write ON operations.shopping_supplier_products FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:approve')) WITH CHECK(operations.allowed(company_id,'procurement:approve'));
CREATE POLICY shopping_requisition_read ON operations.shopping_requisitions FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_requisition_insert ON operations.shopping_requisitions FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'procurement:write') AND requested_by=saas.current_actor());
CREATE POLICY shopping_requisition_update ON operations.shopping_requisitions FOR UPDATE TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:write')) WITH CHECK(operations.allowed(company_id,'procurement:write'));
CREATE POLICY shopping_group_read ON operations.shopping_supplier_groups FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_group_write ON operations.shopping_supplier_groups FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:write')) WITH CHECK(operations.allowed(company_id,'procurement:write'));
CREATE POLICY shopping_line_read ON operations.shopping_requisition_lines FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_line_write ON operations.shopping_requisition_lines FOR ALL TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:write')) WITH CHECK(operations.allowed(company_id,'procurement:write'));
CREATE POLICY shopping_event_read ON operations.shopping_events FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,'procurement:read'));
CREATE POLICY shopping_event_write ON operations.shopping_events FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'procurement:write') AND actor_id=saas.current_actor());

GRANT SELECT,INSERT,UPDATE ON operations.shopping_catalogue,operations.shopping_units,operations.shopping_supplier_products TO vtv_saas_runtime;
GRANT SELECT,INSERT,UPDATE ON operations.shopping_requisitions,operations.shopping_supplier_groups,operations.shopping_requisition_lines TO vtv_saas_runtime;
GRANT SELECT,INSERT ON operations.shopping_events TO vtv_saas_runtime;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE operations.shopping_catalogue,operations.shopping_units,operations.shopping_supplier_products,operations.shopping_requisitions,operations.shopping_supplier_groups,operations.shopping_requisition_lines,operations.shopping_events FROM PUBLIC,vtv_web_runtime;
REVOKE ALL ON TABLE operations.shopping_catalogue,operations.shopping_units,operations.shopping_supplier_products,operations.shopping_requisitions,operations.shopping_supplier_groups,operations.shopping_requisition_lines,operations.shopping_events FROM vtv_web_runtime,vtv_saas_provider_runtime;

COMMENT ON TABLE operations.shopping_catalogue IS 'Company-reviewed catalogue metadata. Unlisted by default; no inferred product identity, live availability, image or price.';
COMMENT ON TABLE operations.shopping_units IS 'Explicit order-unit conversion into the material stock unit; box conversions require buyer evidence.';
COMMENT ON TABLE operations.shopping_supplier_products IS 'Historical or manager-confirmed supplier association; not a live availability or quotation feed.';
COMMENT ON TABLE operations.shopping_requisitions IS 'Persisted ORS cart/master requisition, scoped to one company and assigned buyer.';
COMMENT ON TABLE operations.shopping_requisition_lines IS 'Requested and actually purchased quantities; does not post stock. Inventory changes only through goods receipts.';
COMMENT ON TABLE operations.shopping_events IS 'Company-scoped append-only audit timeline for shopping requisitions.';
COMMENT ON COLUMN operations.shopping_requisitions.required_on IS 'Requester-selected required date; no supplier availability promise is implied.';
COMMENT ON COLUMN operations.shopping_requisitions.priority IS 'Internal purchasing priority, not an externally committed delivery service level.';
COMMENT ON COLUMN operations.shopping_requisition_lines.requester_note IS 'Per-item shopper instructions; removed draft lines are retained for audit.';

-- Cancel only before a buyer confirms any purchase or a goods receipt exists.
-- This cancels linked purchase requests/orders and supplier groups atomically;
-- it never reverses a posted inventory movement.
CREATE FUNCTION operations.cancel_shopping_requisition(p_company uuid,p_requisition uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE r operations.shopping_requisitions%ROWTYPE; order_ids jsonb; request_ids jsonb;
BEGIN
 IF p_actor IS DISTINCT FROM saas.current_actor() OR NOT operations.allowed(p_company,'procurement:write') THEN RAISE EXCEPTION 'Unauthorized requisition cancellation'; END IF;
 SELECT * INTO r FROM operations.shopping_requisitions WHERE company_id=p_company AND id=p_requisition FOR UPDATE;
 IF NOT FOUND OR r.assigned_buyer_id IS DISTINCT FROM p_actor OR r.state NOT IN('accepted','purchasing','partially_purchased') THEN RAISE EXCEPTION 'Requisition cannot be cancelled by this buyer'; END IF;
 IF EXISTS(SELECT 1 FROM operations.shopping_requisition_lines l JOIN operations.shopping_supplier_groups g ON g.company_id=l.company_id AND g.id=l.supplier_group_id WHERE g.company_id=p_company AND g.requisition_id=p_requisition AND l.state='purchased') THEN RAISE EXCEPTION 'A requisition with purchased items cannot be cancelled'; END IF;
 PERFORM 1 FROM operations.shopping_supplier_groups g WHERE g.company_id=p_company AND g.requisition_id=p_requisition ORDER BY g.id FOR UPDATE;
 PERFORM 1 FROM operations.purchase_orders p JOIN operations.shopping_supplier_groups g ON g.company_id=p.company_id AND g.purchase_order_id=p.id WHERE g.company_id=p_company AND g.requisition_id=p_requisition ORDER BY p.id FOR UPDATE OF p;
 IF EXISTS(SELECT 1 FROM operations.purchase_orders p JOIN operations.shopping_supplier_groups g ON g.company_id=p.company_id AND g.purchase_order_id=p.id WHERE g.company_id=p_company AND g.requisition_id=p_requisition AND (p.state NOT IN('ordered','cancelled') OR EXISTS(SELECT 1 FROM operations.goods_receipts gr WHERE gr.company_id=p.company_id AND gr.purchase_order_id=p.id))) THEN RAISE EXCEPTION 'A linked purchase order has receipts or cannot be cancelled'; END IF;
 SELECT coalesce(jsonb_agg(p.id::text ORDER BY p.id),'[]'::jsonb) INTO order_ids FROM operations.purchase_orders p JOIN operations.shopping_supplier_groups g ON g.company_id=p.company_id AND g.purchase_order_id=p.id WHERE g.company_id=p_company AND g.requisition_id=p_requisition;
 SELECT coalesce(jsonb_agg(pr.id::text ORDER BY pr.id),'[]'::jsonb) INTO request_ids FROM operations.purchase_requests pr JOIN operations.shopping_supplier_groups g ON g.company_id=pr.company_id AND g.purchase_request_id=pr.id WHERE g.company_id=p_company AND g.requisition_id=p_requisition;
 UPDATE operations.purchase_orders p SET state='cancelled',version=version+1 FROM operations.shopping_supplier_groups g WHERE g.company_id=p_company AND g.requisition_id=p_requisition AND p.company_id=g.company_id AND p.id=g.purchase_order_id AND p.state='ordered';
 UPDATE operations.purchase_requests pr SET state='cancelled',version=version+1 FROM operations.shopping_supplier_groups g WHERE g.company_id=p_company AND g.requisition_id=p_requisition AND pr.company_id=g.company_id AND pr.id=g.purchase_request_id AND pr.state IN('draft','approved','ordered');
 UPDATE operations.shopping_supplier_groups SET state='cancelled',version=version+1,updated_at=now() WHERE company_id=p_company AND requisition_id=p_requisition;
 RETURN jsonb_build_object('purchaseOrderIds',order_ids,'purchaseRequestIds',request_ids);
END $$;

-- Reconcile completed buyer actuals into the existing unreceived purchase
-- order so the existing receipt function checks the purchased products and
-- quantities. This function never posts inventory; receipts remain the only
-- stock-movement path. The caller records before/after results in the same tx.
CREATE FUNCTION operations.apply_shopping_purchase_reconciliation(p_company uuid,p_requisition uuid,p_group uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE g operations.shopping_supplier_groups%ROWTYPE; r operations.shopping_requisitions%ROWTYPE; po operations.purchase_orders%ROWTYPE;
 before_lines jsonb; after_lines jsonb; has_receipt boolean;
BEGIN
 IF p_actor IS DISTINCT FROM saas.current_actor() OR NOT operations.allowed(p_company,'procurement:approve') THEN
  SELECT * INTO r FROM operations.shopping_requisitions WHERE company_id=p_company AND id=p_requisition;
  IF p_actor IS DISTINCT FROM saas.current_actor() OR r.assigned_buyer_id IS DISTINCT FROM p_actor OR NOT operations.allowed(p_company,'procurement:write') THEN RAISE EXCEPTION 'Unauthorized shopping purchase reconciliation'; END IF;
 END IF;
 SELECT * INTO g FROM operations.shopping_supplier_groups WHERE company_id=p_company AND id=p_group AND requisition_id=p_requisition FOR UPDATE;
 IF NOT FOUND OR g.purchase_order_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM operations.shopping_requisitions WHERE company_id=p_company AND id=p_requisition FOR UPDATE;
 IF NOT FOUND OR r.assigned_buyer_id IS NULL THEN RAISE EXCEPTION 'Shopping requisition unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM operations.shopping_requisition_lines WHERE company_id=p_company AND supplier_group_id=p_group AND state='pending') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM operations.shopping_requisition_lines l WHERE l.company_id=p_company AND l.supplier_group_id=p_group AND l.state='purchased' AND l.actual_material_id IS DISTINCT FROM l.material_id AND NOT EXISTS(SELECT 1 FROM operations.shopping_supplier_products sp WHERE sp.company_id=l.company_id AND sp.material_id=l.actual_material_id AND sp.supplier_id=g.supplier_id AND sp.active)) THEN RAISE EXCEPTION 'Substituted product is not approved for this supplier'; END IF;
 SELECT * INTO po FROM operations.purchase_orders WHERE company_id=p_company AND id=g.purchase_order_id AND supplier_id=g.supplier_id FOR UPDATE;
 IF NOT FOUND OR po.state<>'ordered' THEN RAISE EXCEPTION 'Purchase order is not open for shopping reconciliation'; END IF;
 PERFORM 1 FROM operations.purchase_order_lines WHERE company_id=p_company AND purchase_order_id=po.id ORDER BY position FOR UPDATE;
 SELECT EXISTS(SELECT 1 FROM operations.goods_receipts WHERE company_id=p_company AND purchase_order_id=po.id) INTO has_receipt;
 IF has_receipt THEN RAISE EXCEPTION 'Purchase order already has a receipt'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('materialId',material_id,'quantity',quantity::text,'receivedQuantity',received_quantity::text) ORDER BY position),'[]'::jsonb)
 INTO before_lines FROM operations.purchase_order_lines WHERE company_id=p_company AND purchase_order_id=po.id;
 IF EXISTS(SELECT 1 FROM operations.purchase_order_lines WHERE company_id=p_company AND purchase_order_id=po.id AND received_quantity<>0) THEN RAISE EXCEPTION 'Purchase order has received quantities'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('materialId',material_id,'quantity',quantity::text) ORDER BY material_id),'[]'::jsonb)
 INTO after_lines FROM (SELECT actual_material_id AS material_id,round(sum(actual_quantity*actual_base_quantity_per_unit),4) AS quantity
  FROM operations.shopping_requisition_lines WHERE company_id=p_company AND supplier_group_id=p_group AND state='purchased' GROUP BY actual_material_id) actual;
 DELETE FROM operations.purchase_order_lines WHERE company_id=p_company AND purchase_order_id=po.id;
 INSERT INTO operations.purchase_order_lines(company_id,purchase_order_id,position,material_id,quantity)
 SELECT p_company,po.id,entry.ordinality::integer,(entry.value->>'materialId')::uuid,(entry.value->>'quantity')::numeric
 FROM jsonb_array_elements(after_lines) WITH ORDINALITY AS entry(value,ordinality);
 UPDATE operations.purchase_orders SET state=CASE WHEN jsonb_array_length(after_lines)=0 THEN 'cancelled' ELSE 'ordered' END,version=version+1
 WHERE company_id=p_company AND id=po.id;
 UPDATE operations.shopping_supplier_groups SET state=CASE WHEN EXISTS(SELECT 1 FROM operations.shopping_requisition_lines WHERE company_id=p_company AND supplier_group_id=p_group AND state='unavailable') THEN 'partially_purchased' ELSE 'purchased' END,version=version+1,updated_at=now()
 WHERE company_id=p_company AND id=p_group;
 RETURN jsonb_build_object('purchaseOrderId',po.id,'before',before_lines,'after',after_lines,'state',CASE WHEN jsonb_array_length(after_lines)=0 THEN 'cancelled' ELSE 'ordered' END);
END $$;

REVOKE ALL ON FUNCTION operations.cancel_shopping_requisition(uuid,uuid,uuid) FROM PUBLIC,vtv_web_runtime,vtv_saas_provider_runtime;
GRANT EXECUTE ON FUNCTION operations.cancel_shopping_requisition(uuid,uuid,uuid) TO vtv_saas_runtime;
REVOKE ALL ON FUNCTION operations.apply_shopping_purchase_reconciliation(uuid,uuid,uuid,uuid) FROM PUBLIC,vtv_web_runtime,vtv_saas_provider_runtime;
GRANT EXECUTE ON FUNCTION operations.apply_shopping_purchase_reconciliation(uuid,uuid,uuid,uuid) TO vtv_saas_runtime;

-- Add only the command names used by this migration's parameterized service.
-- Preserve the entire installed command vocabulary and reject an unexpected
-- schema state instead of replacing it with a guessed list.
DO $$ DECLARE original_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression
 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check';
 IF original_expression LIKE '%ors.shopping.%' THEN RAISE EXCEPTION 'Shopping command vocabulary already exists; inspect migration state'; END IF;
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format('ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation IN (%L,%L,%L,%L,%L,%L,%L,%L,%L))',original_expression,
  'ors.shopping.cart.add','ors.shopping.cart.update','ors.shopping.cart.remove',
  'ors.shopping.requisition.assign','ors.shopping.requisition.transition','ors.shopping.line.reconcile',
  'ors.shopping.catalogue.configure','ors.shopping.catalogue.unit','ors.shopping.catalogue.supplier');
END $$;
COMMIT;

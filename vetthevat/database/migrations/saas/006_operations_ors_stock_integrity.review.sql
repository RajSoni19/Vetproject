-- REVIEW ONLY. Corrected replacement for unapproved migration 006; never imported by application startup.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR NOT EXISTS(SELECT 1 FROM business.migrations WHERE version=3)
 OR to_regclass('saas.provider_events') IS NULL
 OR to_regclass('operations.materials') IS NOT NULL THEN
   RAISE EXCEPTION 'Unapproved target or existing operations schema';
 END IF;
END $$;

CREATE SCHEMA operations AUTHORIZATION vtv_saas_owner;
SET LOCAL ROLE vtv_saas_owner;

CREATE TABLE operations.materials(
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES web_auth.companies(id),
 sku text NOT NULL CHECK(sku~'^[A-Z0-9][A-Z0-9._/-]{0,79}$'), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 unit text NOT NULL CHECK(unit~'^[A-Z0-9][A-Z0-9._/-]{0,15}$'), reorder_point numeric(18,4) NOT NULL CHECK(reorder_point>0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','archived')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,sku), UNIQUE(company_id,id));
CREATE TABLE operations.warehouses(
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES web_auth.companies(id), code text NOT NULL CHECK(code~'^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), state text NOT NULL DEFAULT 'active' CHECK(state IN('active','archived')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,code), UNIQUE(company_id,id));
CREATE TABLE operations.stock_locations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, warehouse_id uuid NOT NULL,
 code text NOT NULL CHECK(code~'^[A-Z0-9][A-Z0-9._/-]{0,39}$'), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','archived')), UNIQUE(company_id,warehouse_id,code), UNIQUE(company_id,id),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES operations.warehouses(company_id,id));
CREATE TABLE operations.stock_balances(
 company_id uuid NOT NULL, material_id uuid NOT NULL, location_id uuid NOT NULL,
 on_hand numeric(18,4) NOT NULL DEFAULT 0 CHECK(on_hand>=0), reserved numeric(18,4) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,material_id,location_id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id),
 FOREIGN KEY(company_id,location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE TABLE operations.purchase_requests(
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES web_auth.companies(id), supplier_id uuid NOT NULL, requested_on date NOT NULL, notes text,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','approved','ordered','cancelled')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES web_auth.users(id), approved_by uuid REFERENCES web_auth.users(id), approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id));
CREATE TABLE operations.purchase_request_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, request_id uuid NOT NULL, position integer NOT NULL CHECK(position BETWEEN 1 AND 500), material_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 UNIQUE(company_id,request_id,position), UNIQUE(company_id,request_id,material_id), FOREIGN KEY(company_id,request_id) REFERENCES operations.purchase_requests(company_id,id), FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id));
CREATE TABLE operations.purchase_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES web_auth.companies(id), request_id uuid NOT NULL, supplier_id uuid NOT NULL, ordered_on date NOT NULL,
 state text NOT NULL DEFAULT 'ordered' CHECK(state IN('ordered','part_received','received','closed','cancelled')), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,request_id), UNIQUE(company_id,id),
 FOREIGN KEY(company_id,request_id) REFERENCES operations.purchase_requests(company_id,id), FOREIGN KEY(company_id,supplier_id) REFERENCES business.counterparties(company_id,id));
CREATE TABLE operations.purchase_order_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, purchase_order_id uuid NOT NULL, position integer NOT NULL CHECK(position BETWEEN 1 AND 500), material_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0), received_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK(received_quantity BETWEEN 0 AND quantity),
 UNIQUE(company_id,purchase_order_id,position), UNIQUE(company_id,purchase_order_id,material_id), FOREIGN KEY(company_id,purchase_order_id) REFERENCES operations.purchase_orders(company_id,id), FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id));
CREATE TABLE operations.goods_receipts(
 id uuid PRIMARY KEY, company_id uuid NOT NULL, purchase_order_id uuid NOT NULL, location_id uuid NOT NULL, received_on date NOT NULL, reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100),
 state text NOT NULL DEFAULT 'posted' CHECK(state='posted'), received_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,purchase_order_id,reference), UNIQUE(company_id,id),
 FOREIGN KEY(company_id,purchase_order_id) REFERENCES operations.purchase_orders(company_id,id), FOREIGN KEY(company_id,location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE TABLE operations.goods_receipt_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, receipt_id uuid NOT NULL, material_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 UNIQUE(company_id,receipt_id,material_id), FOREIGN KEY(company_id,receipt_id) REFERENCES operations.goods_receipts(company_id,id), FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id));
CREATE TABLE operations.inventory_movements(
 id uuid PRIMARY KEY, company_id uuid NOT NULL, material_id uuid NOT NULL, location_id uuid NOT NULL,
 on_hand_delta numeric(18,4) NOT NULL DEFAULT 0, reserved_delta numeric(18,4) NOT NULL DEFAULT 0,
 kind text NOT NULL CHECK(kind IN('receipt','adjustment','transfer_out','transfer_in','reservation','release','dispatch','return')), reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100), source_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(on_hand_delta<>0 OR reserved_delta<>0),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id), FOREIGN KEY(company_id,location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE INDEX inventory_movement_company_material ON operations.inventory_movements(company_id,material_id,created_at,id);
CREATE TABLE operations.sales_orders(
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES web_auth.companies(id), customer_id uuid NOT NULL, ordered_on date NOT NULL, notes text,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','approved','picking','packed','dispatched','closed','returned')), version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,id), FOREIGN KEY(company_id,customer_id) REFERENCES business.counterparties(company_id,id));
CREATE TABLE operations.sales_order_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, sales_order_id uuid NOT NULL, position integer NOT NULL CHECK(position BETWEEN 1 AND 500), material_id uuid NOT NULL, location_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0), fulfilled_quantity numeric(18,4) NOT NULL DEFAULT 0 CHECK(fulfilled_quantity BETWEEN 0 AND quantity),
 UNIQUE(company_id,id), UNIQUE(company_id,sales_order_id,position), UNIQUE(company_id,sales_order_id,material_id), FOREIGN KEY(company_id,sales_order_id) REFERENCES operations.sales_orders(company_id,id), FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id), FOREIGN KEY(company_id,location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE TABLE operations.stock_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, sales_order_id uuid NOT NULL, sales_order_line_id uuid NOT NULL, material_id uuid NOT NULL, location_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','released','consumed')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,sales_order_line_id),
 FOREIGN KEY(company_id,sales_order_id) REFERENCES operations.sales_orders(company_id,id), FOREIGN KEY(company_id,sales_order_line_id) REFERENCES operations.sales_order_lines(company_id,id), FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id), FOREIGN KEY(company_id,location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE TABLE operations.stock_transfers(
 id uuid PRIMARY KEY, company_id uuid NOT NULL, material_id uuid NOT NULL, from_location_id uuid NOT NULL, to_location_id uuid NOT NULL, quantity numeric(18,4) NOT NULL CHECK(quantity>0), reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100), state text NOT NULL DEFAULT 'posted' CHECK(state='posted'), created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), CHECK(from_location_id<>to_location_id),
 FOREIGN KEY(company_id,material_id) REFERENCES operations.materials(company_id,id), FOREIGN KEY(company_id,from_location_id) REFERENCES operations.stock_locations(company_id,id), FOREIGN KEY(company_id,to_location_id) REFERENCES operations.stock_locations(company_id,id));
CREATE TABLE operations.fulfilments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, sales_order_id uuid NOT NULL, status text NOT NULL CHECK(status IN('picked','packed','dispatched','returned')), tracking_reference text CHECK(length(tracking_reference)<=100), created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(company_id,sales_order_id) REFERENCES operations.sales_orders(company_id,id));
CREATE TABLE operations.invoice_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, invoice_id uuid NOT NULL, purchase_order_id uuid, goods_receipt_id uuid, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','matched','exception')), created_by uuid NOT NULL REFERENCES web_auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,invoice_id),
 FOREIGN KEY(company_id,invoice_id) REFERENCES business.invoices(company_id,id), FOREIGN KEY(company_id,purchase_order_id) REFERENCES operations.purchase_orders(company_id,id), FOREIGN KEY(company_id,goods_receipt_id) REFERENCES operations.goods_receipts(company_id,id));

CREATE FUNCTION operations.allowed(p_company uuid,p_capability text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT saas.authorized_company(p_company,p_capability) $$;
CREATE FUNCTION operations.reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Inventory ledger is immutable'; END $$;
CREATE TRIGGER inventory_ledger_immutable BEFORE UPDATE OR DELETE ON operations.inventory_movements FOR EACH ROW EXECUTE FUNCTION operations.reject_ledger_mutation();

CREATE FUNCTION operations.approve_purchase_request(p_company uuid,p_request uuid,p_expected_version bigint,p_actor uuid) RETURNS TABLE(id uuid,version bigint,state text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
BEGIN
 IF NOT saas.authorized_company(p_company,'procurement:approve') THEN RAISE EXCEPTION 'Unauthorized purchase approval'; END IF;
 UPDATE operations.purchase_requests SET state='approved',approved_by=p_actor,approved_at=now(),version=version+1 WHERE company_id=p_company AND id=p_request AND state='draft' AND version=p_expected_version RETURNING purchase_requests.id,purchase_requests.version,purchase_requests.state INTO id,version,state;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid purchase request transition'; END IF; RETURN NEXT;
END $$;
CREATE FUNCTION operations.issue_purchase_order(p_company uuid,p_request uuid,p_ordered_on date,p_actor uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE r operations.purchase_requests%ROWTYPE; po uuid:=gen_random_uuid();
BEGIN
 IF NOT saas.authorized_company(p_company,'procurement:approve') THEN RAISE EXCEPTION 'Unauthorized purchase order'; END IF;
 SELECT * INTO r FROM operations.purchase_requests WHERE company_id=p_company AND id=p_request AND state='approved' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Approved purchase request required'; END IF;
 INSERT INTO operations.purchase_orders(id,company_id,request_id,supplier_id,ordered_on,created_by) VALUES(po,p_company,p_request,r.supplier_id,p_ordered_on,p_actor);
 INSERT INTO operations.purchase_order_lines(company_id,purchase_order_id,position,material_id,quantity) SELECT p_company,po,position,material_id,quantity FROM operations.purchase_request_lines WHERE company_id=p_company AND request_id=p_request ORDER BY position;
 UPDATE operations.purchase_requests SET state='ordered',version=version+1 WHERE company_id=p_company AND id=p_request; RETURN po;
END $$;
CREATE FUNCTION operations.receive_purchase_line(p_company uuid,p_receipt uuid,p_purchase uuid,p_location uuid,p_material uuid,p_quantity numeric,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE line operations.purchase_order_lines%ROWTYPE;
BEGIN
 IF NOT saas.authorized_company(p_company,'inventory:receive') OR p_quantity<=0 THEN RAISE EXCEPTION 'Unauthorized receipt'; END IF;
 PERFORM 1 FROM operations.stock_locations WHERE company_id=p_company AND id=p_location AND state='active'; IF NOT FOUND THEN RAISE EXCEPTION 'Stock location unavailable'; END IF;
 SELECT * INTO line FROM operations.purchase_order_lines WHERE company_id=p_company AND purchase_order_id=p_purchase AND material_id=p_material FOR UPDATE;
 IF NOT FOUND OR line.received_quantity+p_quantity>line.quantity THEN RAISE EXCEPTION 'Receipt exceeds ordered quantity'; END IF;
 INSERT INTO operations.stock_balances(company_id,material_id,location_id,on_hand,reserved) VALUES(p_company,p_material,p_location,p_quantity,0) ON CONFLICT(company_id,material_id,location_id) DO UPDATE SET on_hand=operations.stock_balances.on_hand+EXCLUDED.on_hand,updated_at=now();
 INSERT INTO operations.goods_receipt_lines(company_id,receipt_id,material_id,quantity) VALUES(p_company,p_receipt,p_material,p_quantity);
 INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,p_material,p_location,p_quantity,0,'receipt',p_receipt::text,p_receipt,p_actor);
 UPDATE operations.purchase_order_lines SET received_quantity=received_quantity+p_quantity WHERE id=line.id;
 UPDATE operations.purchase_orders SET state=CASE WHEN EXISTS(SELECT 1 FROM operations.purchase_order_lines pol WHERE pol.company_id=p_company AND pol.purchase_order_id=p_purchase AND pol.received_quantity<pol.quantity) THEN 'part_received' ELSE 'received' END,version=version+1 WHERE company_id=p_company AND id=p_purchase;
END $$;
CREATE FUNCTION operations.adjust_stock(p_company uuid,p_movement uuid,p_material uuid,p_location uuid,p_quantity numeric,p_reason text,p_actor uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE b operations.stock_balances%ROWTYPE;
BEGIN
 IF NOT saas.authorized_company(p_company,'inventory:adjust') OR p_quantity=0 THEN RAISE EXCEPTION 'Unauthorized adjustment'; END IF;
 INSERT INTO operations.stock_balances(company_id,material_id,location_id) VALUES(p_company,p_material,p_location) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM operations.stock_balances WHERE company_id=p_company AND material_id=p_material AND location_id=p_location FOR UPDATE;
 IF NOT FOUND OR b.on_hand+p_quantity<b.reserved THEN RAISE EXCEPTION 'Insufficient unreserved stock'; END IF;
 UPDATE operations.stock_balances SET on_hand=on_hand+p_quantity,updated_at=now() WHERE company_id=p_company AND material_id=p_material AND location_id=p_location;
 INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(p_movement,p_company,p_material,p_location,p_quantity,0,'adjustment',p_reason,p_movement,p_actor); RETURN p_movement;
END $$;
CREATE FUNCTION operations.transfer_stock(p_company uuid,p_transfer uuid,p_material uuid,p_from uuid,p_to uuid,p_quantity numeric,p_reference text,p_actor uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE source_balance operations.stock_balances%ROWTYPE;
BEGIN
 IF NOT saas.authorized_company(p_company,'inventory:transfer') OR p_quantity<=0 OR p_from=p_to THEN RAISE EXCEPTION 'Unauthorized transfer'; END IF;
 INSERT INTO operations.stock_balances(company_id,material_id,location_id) VALUES(p_company,p_material,p_from),(p_company,p_material,p_to) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM operations.stock_balances WHERE company_id=p_company AND material_id=p_material AND location_id IN(p_from,p_to) ORDER BY location_id FOR UPDATE;
 SELECT * INTO source_balance FROM operations.stock_balances WHERE company_id=p_company AND material_id=p_material AND location_id=p_from;
 IF source_balance.on_hand-source_balance.reserved<p_quantity THEN RAISE EXCEPTION 'Insufficient unreserved stock'; END IF;
 UPDATE operations.stock_balances SET on_hand=on_hand-p_quantity,updated_at=now() WHERE company_id=p_company AND material_id=p_material AND location_id=p_from;
 UPDATE operations.stock_balances SET on_hand=on_hand+p_quantity,updated_at=now() WHERE company_id=p_company AND material_id=p_material AND location_id=p_to;
 INSERT INTO operations.stock_transfers(id,company_id,material_id,from_location_id,to_location_id,quantity,reference,created_by) VALUES(p_transfer,p_company,p_material,p_from,p_to,p_quantity,p_reference,p_actor);
 INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,p_material,p_from,-p_quantity,0,'transfer_out',p_reference,p_transfer,p_actor),(gen_random_uuid(),p_company,p_material,p_to,p_quantity,0,'transfer_in',p_reference,p_transfer,p_actor); RETURN p_transfer;
END $$;
CREATE FUNCTION operations.transition_sales_order(p_company uuid,p_order uuid,p_next text,p_expected_version bigint,p_actor uuid) RETURNS TABLE(id uuid,version bigint,state text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE o operations.sales_orders%ROWTYPE; line record; b operations.stock_balances%ROWTYPE;
BEGIN
 IF NOT saas.authorized_company(p_company,CASE WHEN p_next='approved' THEN 'sales:approve' ELSE 'fulfilment:write' END) THEN RAISE EXCEPTION 'Unauthorized sales transition'; END IF;
 SELECT * INTO o FROM operations.sales_orders WHERE company_id=p_company AND id=p_order AND version=p_expected_version FOR UPDATE;
 IF NOT FOUND OR NOT ((o.state='draft' AND p_next='approved') OR (o.state='approved' AND p_next='picking') OR (o.state='picking' AND p_next='packed') OR (o.state='packed' AND p_next='dispatched') OR (o.state='dispatched' AND p_next IN('closed','returned'))) THEN RAISE EXCEPTION 'Invalid sales transition'; END IF;
 IF p_next='approved' THEN
  FOR line IN SELECT * FROM operations.sales_order_lines WHERE company_id=p_company AND sales_order_id=p_order ORDER BY material_id,location_id FOR UPDATE LOOP
   INSERT INTO operations.stock_balances(company_id,material_id,location_id) VALUES(p_company,line.material_id,line.location_id) ON CONFLICT DO NOTHING;
   SELECT * INTO b FROM operations.stock_balances WHERE company_id=p_company AND material_id=line.material_id AND location_id=line.location_id FOR UPDATE;
   IF b.on_hand-b.reserved<line.quantity THEN RAISE EXCEPTION 'Insufficient stock for reservation'; END IF;
   INSERT INTO operations.stock_reservations(company_id,sales_order_id,sales_order_line_id,material_id,location_id,quantity) VALUES(p_company,p_order,line.id,line.material_id,line.location_id,line.quantity);
   UPDATE operations.stock_balances SET reserved=reserved+line.quantity,updated_at=now() WHERE company_id=p_company AND material_id=line.material_id AND location_id=line.location_id;
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,0,line.quantity,'reservation',p_order::text,p_order,p_actor);
  END LOOP;
 ELSIF p_next='dispatched' THEN
  FOR line IN SELECT r.*,l.quantity AS ordered_quantity FROM operations.stock_reservations r JOIN operations.sales_order_lines l ON l.company_id=r.company_id AND l.id=r.sales_order_line_id WHERE r.company_id=p_company AND r.sales_order_id=p_order AND r.state='active' ORDER BY r.material_id,r.location_id FOR UPDATE LOOP
   SELECT * INTO b FROM operations.stock_balances WHERE company_id=p_company AND material_id=line.material_id AND location_id=line.location_id FOR UPDATE;
   IF NOT FOUND OR b.on_hand<line.quantity OR b.reserved<line.quantity THEN RAISE EXCEPTION 'Reserved stock no longer available'; END IF;
   UPDATE operations.stock_balances SET on_hand=on_hand-line.quantity,reserved=reserved-line.quantity,updated_at=now() WHERE company_id=p_company AND material_id=line.material_id AND location_id=line.location_id;
   UPDATE operations.stock_reservations SET state='consumed' WHERE id=line.id;
   UPDATE operations.sales_order_lines SET fulfilled_quantity=fulfilled_quantity+line.quantity WHERE company_id=p_company AND id=line.sales_order_line_id;
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,-line.quantity,-line.quantity,'dispatch',p_order::text,p_order,p_actor);
  END LOOP;
 ELSIF p_next='returned' THEN
  FOR line IN SELECT * FROM operations.sales_order_lines WHERE company_id=p_company AND sales_order_id=p_order AND fulfilled_quantity>0 ORDER BY material_id,location_id FOR UPDATE LOOP
   INSERT INTO operations.stock_balances(company_id,material_id,location_id,on_hand,reserved) VALUES(p_company,line.material_id,line.location_id,line.fulfilled_quantity,0) ON CONFLICT(company_id,material_id,location_id) DO UPDATE SET on_hand=operations.stock_balances.on_hand+EXCLUDED.on_hand,updated_at=now();
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,line.fulfilled_quantity,0,'return',p_order::text,p_order,p_actor);
  END LOOP;
 END IF;
 UPDATE operations.sales_orders SET state=p_next,version=version+1 WHERE company_id=p_company AND id=p_order RETURNING sales_orders.id,sales_orders.version,sales_orders.state INTO id,version,state;
 IF p_next IN('picking','packed','dispatched','returned') THEN INSERT INTO operations.fulfilments(company_id,sales_order_id,status,created_by) VALUES(p_company,p_order,p_next,p_actor); END IF;
 RETURN NEXT;
END $$;

DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['materials','warehouses','stock_locations','stock_balances','purchase_requests','purchase_request_lines','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','inventory_movements','sales_orders','sales_order_lines','stock_reservations','stock_transfers','fulfilments','invoice_matches'] LOOP
  EXECUTE format('ALTER TABLE operations.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('ALTER TABLE operations.%I FORCE ROW LEVEL SECURITY',item);
  EXECUTE format('CREATE POLICY runtime_read ON operations.%I FOR SELECT TO vtv_saas_runtime USING(operations.allowed(company_id,''company:read''))',item);
  EXECUTE format('CREATE POLICY owner_all ON operations.%I FOR ALL TO vtv_saas_owner USING(true) WITH CHECK(true)',item);
 END LOOP;
END $$;
CREATE POLICY material_insert ON operations.materials FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND operations.allowed(company_id,'procurement:write'));
CREATE POLICY warehouse_insert ON operations.warehouses FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND operations.allowed(company_id,'inventory:adjust'));
CREATE POLICY location_insert ON operations.stock_locations FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'inventory:adjust'));
CREATE POLICY request_insert ON operations.purchase_requests FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND state='draft' AND operations.allowed(company_id,'procurement:write'));
CREATE POLICY request_line_insert ON operations.purchase_request_lines FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'procurement:write'));
CREATE POLICY sales_order_insert ON operations.sales_orders FOR INSERT TO vtv_saas_runtime WITH CHECK(created_by=saas.current_actor() AND state='draft' AND operations.allowed(company_id,'sales:write'));
CREATE POLICY sales_line_insert ON operations.sales_order_lines FOR INSERT TO vtv_saas_runtime WITH CHECK(operations.allowed(company_id,'sales:write'));

GRANT USAGE ON SCHEMA operations TO vtv_saas_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA operations TO vtv_saas_runtime;
GRANT INSERT ON operations.materials,operations.warehouses,operations.stock_locations,operations.purchase_requests,operations.purchase_request_lines,operations.sales_orders,operations.sales_order_lines TO vtv_saas_runtime;
GRANT EXECUTE ON FUNCTION operations.approve_purchase_request(uuid,uuid,bigint,uuid),operations.issue_purchase_order(uuid,uuid,date,uuid),operations.receive_purchase_line(uuid,uuid,uuid,uuid,uuid,numeric,uuid),operations.adjust_stock(uuid,uuid,uuid,uuid,numeric,text,uuid),operations.transfer_stock(uuid,uuid,uuid,uuid,uuid,numeric,text,uuid),operations.transition_sales_order(uuid,uuid,text,bigint,uuid) TO vtv_saas_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA operations FROM PUBLIC,vtv_web_runtime,vtv_saas_provider_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA operations FROM PUBLIC,vtv_web_runtime,vtv_saas_provider_runtime;
COMMIT;

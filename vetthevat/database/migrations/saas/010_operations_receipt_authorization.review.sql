-- REVIEW ONLY. Completes the intended receipt boundary without broad runtime stock privileges.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.goods_receipts') IS NULL
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='operations' AND tablename='goods_receipts' AND policyname='goods_receipt_insert')
 OR has_table_privilege('vtv_saas_runtime','operations.goods_receipts','INSERT')
 OR pg_get_functiondef('operations.receive_purchase_line(uuid,uuid,uuid,uuid,uuid,numeric,uuid)'::regprocedure) NOT LIKE '%Receipt exceeds ordered quantity%'
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or receipt authorization state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE POLICY goods_receipt_insert ON operations.goods_receipts FOR INSERT TO vtv_saas_runtime WITH CHECK(received_by=saas.current_actor() AND state='posted' AND operations.allowed(company_id,'inventory:receive'));
GRANT INSERT ON operations.goods_receipts TO vtv_saas_runtime;
CREATE OR REPLACE FUNCTION operations.receive_purchase_line(p_company uuid,p_receipt uuid,p_purchase uuid,p_location uuid,p_material uuid,p_quantity numeric,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE line operations.purchase_order_lines%ROWTYPE;purchase_state text;
BEGIN
 IF NOT saas.authorized_company(p_company,'inventory:receive') OR p_quantity<=0 THEN RAISE EXCEPTION 'Unauthorized receipt'; END IF;
 SELECT po.state INTO purchase_state FROM operations.purchase_orders AS po WHERE po.company_id=p_company AND po.id=p_purchase FOR UPDATE;
 IF NOT FOUND OR purchase_state NOT IN('ordered','part_received') THEN RAISE EXCEPTION 'Issued purchase order required'; END IF;
 PERFORM 1 FROM operations.goods_receipts AS gr WHERE gr.company_id=p_company AND gr.id=p_receipt AND gr.purchase_order_id=p_purchase AND gr.location_id=p_location AND gr.received_by=p_actor AND gr.state='posted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Owned posted receipt required'; END IF;
 PERFORM 1 FROM operations.stock_locations AS sl WHERE sl.company_id=p_company AND sl.id=p_location AND sl.state='active'; IF NOT FOUND THEN RAISE EXCEPTION 'Stock location unavailable'; END IF;
 SELECT pol.* INTO line FROM operations.purchase_order_lines AS pol WHERE pol.company_id=p_company AND pol.purchase_order_id=p_purchase AND pol.material_id=p_material FOR UPDATE;
 IF NOT FOUND OR line.received_quantity+p_quantity>line.quantity THEN RAISE EXCEPTION 'Receipt exceeds ordered quantity'; END IF;
 INSERT INTO operations.stock_balances(company_id,material_id,location_id,on_hand,reserved) VALUES(p_company,p_material,p_location,p_quantity,0) ON CONFLICT(company_id,material_id,location_id) DO UPDATE SET on_hand=operations.stock_balances.on_hand+EXCLUDED.on_hand,updated_at=now();
 INSERT INTO operations.goods_receipt_lines(company_id,receipt_id,material_id,quantity) VALUES(p_company,p_receipt,p_material,p_quantity);
 INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,p_material,p_location,p_quantity,0,'receipt',p_receipt::text,p_receipt,p_actor);
 UPDATE operations.purchase_order_lines AS pol SET received_quantity=pol.received_quantity+p_quantity WHERE pol.id=line.id;
 UPDATE operations.purchase_orders AS po SET state=CASE WHEN EXISTS(SELECT 1 FROM operations.purchase_order_lines AS pol WHERE pol.company_id=p_company AND pol.purchase_order_id=p_purchase AND pol.received_quantity<pol.quantity) THEN 'part_received' ELSE 'received' END,version=po.version+1 WHERE po.company_id=p_company AND po.id=p_purchase;
END $$;
COMMIT;

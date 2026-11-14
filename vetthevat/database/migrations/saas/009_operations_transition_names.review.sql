-- REVIEW ONLY. Corrects ambiguous PL/pgSQL output-variable references in two existing ORS transitions.
-- No table, RLS policy, role, grant or data change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.sales_orders') IS NULL
 OR pg_get_functiondef('operations.approve_purchase_request(uuid,uuid,bigint,uuid)'::regprocedure) NOT LIKE '%version=version+1%'
 OR pg_get_functiondef('operations.transition_sales_order(uuid,uuid,text,bigint,uuid)'::regprocedure) NOT LIKE '%version=version+1%'
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or function state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
CREATE OR REPLACE FUNCTION operations.approve_purchase_request(p_company uuid,p_request uuid,p_expected_version bigint,p_actor uuid) RETURNS TABLE(id uuid,version bigint,state text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE result_id uuid;result_version bigint;result_state text;
BEGIN
 IF NOT saas.authorized_company(p_company,'procurement:approve') THEN RAISE EXCEPTION 'Unauthorized purchase approval'; END IF;
 UPDATE operations.purchase_requests AS pr SET state='approved',approved_by=p_actor,approved_at=now(),version=pr.version+1 WHERE pr.company_id=p_company AND pr.id=p_request AND pr.state='draft' AND pr.version=p_expected_version RETURNING pr.id,pr.version,pr.state INTO result_id,result_version,result_state;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid purchase request transition'; END IF;
 id:=result_id;version:=result_version;state:=result_state;RETURN NEXT;
END $$;
CREATE OR REPLACE FUNCTION operations.transition_sales_order(p_company uuid,p_order uuid,p_next text,p_expected_version bigint,p_actor uuid) RETURNS TABLE(id uuid,version bigint,state text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas,operations AS $$
DECLARE o operations.sales_orders%ROWTYPE;line record;b operations.stock_balances%ROWTYPE;result_id uuid;result_version bigint;result_state text;
BEGIN
 IF NOT saas.authorized_company(p_company,CASE WHEN p_next='approved' THEN 'sales:approve' ELSE 'fulfilment:write' END) THEN RAISE EXCEPTION 'Unauthorized sales transition'; END IF;
 SELECT so.* INTO o FROM operations.sales_orders AS so WHERE so.company_id=p_company AND so.id=p_order AND so.version=p_expected_version FOR UPDATE;
 IF NOT FOUND OR NOT ((o.state='draft' AND p_next='approved') OR (o.state='approved' AND p_next='picking') OR (o.state='picking' AND p_next='packed') OR (o.state='packed' AND p_next='dispatched') OR (o.state='dispatched' AND p_next IN('closed','returned'))) THEN RAISE EXCEPTION 'Invalid sales transition'; END IF;
 IF p_next='approved' THEN
  FOR line IN SELECT sol.* FROM operations.sales_order_lines AS sol WHERE sol.company_id=p_company AND sol.sales_order_id=p_order ORDER BY sol.material_id,sol.location_id FOR UPDATE LOOP
   INSERT INTO operations.stock_balances(company_id,material_id,location_id) VALUES(p_company,line.material_id,line.location_id) ON CONFLICT DO NOTHING;
   SELECT sb.* INTO b FROM operations.stock_balances AS sb WHERE sb.company_id=p_company AND sb.material_id=line.material_id AND sb.location_id=line.location_id FOR UPDATE;
   IF b.on_hand-b.reserved<line.quantity THEN RAISE EXCEPTION 'Insufficient stock for reservation'; END IF;
   INSERT INTO operations.stock_reservations(company_id,sales_order_id,sales_order_line_id,material_id,location_id,quantity) VALUES(p_company,p_order,line.id,line.material_id,line.location_id,line.quantity);
   UPDATE operations.stock_balances AS sb SET reserved=sb.reserved+line.quantity,updated_at=now() WHERE sb.company_id=p_company AND sb.material_id=line.material_id AND sb.location_id=line.location_id;
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,0,line.quantity,'reservation',p_order::text,p_order,p_actor);
  END LOOP;
 ELSIF p_next='dispatched' THEN
  FOR line IN SELECT r.*,sol.quantity AS ordered_quantity FROM operations.stock_reservations AS r JOIN operations.sales_order_lines AS sol ON sol.company_id=r.company_id AND sol.id=r.sales_order_line_id WHERE r.company_id=p_company AND r.sales_order_id=p_order AND r.state='active' ORDER BY r.material_id,r.location_id FOR UPDATE LOOP
   SELECT sb.* INTO b FROM operations.stock_balances AS sb WHERE sb.company_id=p_company AND sb.material_id=line.material_id AND sb.location_id=line.location_id FOR UPDATE;
   IF NOT FOUND OR b.on_hand<line.quantity OR b.reserved<line.quantity THEN RAISE EXCEPTION 'Reserved stock no longer available'; END IF;
   UPDATE operations.stock_balances AS sb SET on_hand=sb.on_hand-line.quantity,reserved=sb.reserved-line.quantity,updated_at=now() WHERE sb.company_id=p_company AND sb.material_id=line.material_id AND sb.location_id=line.location_id;
   UPDATE operations.stock_reservations AS r SET state='consumed' WHERE r.id=line.id;
   UPDATE operations.sales_order_lines AS sol SET fulfilled_quantity=sol.fulfilled_quantity+line.quantity WHERE sol.company_id=p_company AND sol.id=line.sales_order_line_id;
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,-line.quantity,-line.quantity,'dispatch',p_order::text,p_order,p_actor);
  END LOOP;
 ELSIF p_next='returned' THEN
  FOR line IN SELECT sol.* FROM operations.sales_order_lines AS sol WHERE sol.company_id=p_company AND sol.sales_order_id=p_order AND sol.fulfilled_quantity>0 ORDER BY sol.material_id,sol.location_id FOR UPDATE LOOP
   INSERT INTO operations.stock_balances(company_id,material_id,location_id,on_hand,reserved) VALUES(p_company,line.material_id,line.location_id,line.fulfilled_quantity,0) ON CONFLICT(company_id,material_id,location_id) DO UPDATE SET on_hand=operations.stock_balances.on_hand+EXCLUDED.on_hand,updated_at=now();
   INSERT INTO operations.inventory_movements(id,company_id,material_id,location_id,on_hand_delta,reserved_delta,kind,reference,source_id,created_by) VALUES(gen_random_uuid(),p_company,line.material_id,line.location_id,line.fulfilled_quantity,0,'return',p_order::text,p_order,p_actor);
  END LOOP;
 END IF;
 UPDATE operations.sales_orders AS so SET state=p_next,version=so.version+1 WHERE so.company_id=p_company AND so.id=p_order RETURNING so.id,so.version,so.state INTO result_id,result_version,result_state;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sales order disappeared'; END IF;
 IF p_next IN('picking','packed','dispatched','returned') THEN INSERT INTO operations.fulfilments(company_id,sales_order_id,status,created_by) VALUES(p_company,p_order,p_next,p_actor); END IF;
 id:=result_id;version:=result_version;state:=result_state;RETURN NEXT;
END $$;
COMMIT;

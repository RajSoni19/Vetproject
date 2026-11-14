-- REVIEW ONLY. Allows idempotent commands for stock locations and invoice matches.
-- No data, table, RLS, role or financial record changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.stock_locations') IS NULL OR to_regclass('operations.invoice_matches') IS NULL
 OR to_regprocedure('operations.reject_purchase_request(uuid,uuid,bigint,uuid)') IS NULL
 OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='operations' AND tablename='invoice_matches' AND policyname='invoice_match_insert')
 OR has_table_privilege('vtv_saas_runtime','operations.invoice_matches','INSERT')
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check'
   AND pg_get_constraintdef(oid) LIKE '%operations.purchase-request.create%operations.sales-order.transition%')
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or command-key constraint state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK(operation IN(
 'contact.save','invoice.create','invoice.replace','invoice.confirm','invoice.attach',
 'operations.material.create','operations.warehouse.create','operations.location.create',
 'operations.purchase-request.create','operations.purchase-request.approve','operations.purchase-request.reject',
 'operations.purchase-order.create','operations.goods-receipt.create','operations.stock.adjust',
 'operations.stock.transfer','operations.sales-order.create','operations.sales-order.transition',
 'operations.invoice.match'
));
CREATE POLICY invoice_match_insert ON operations.invoice_matches FOR INSERT TO vtv_saas_runtime
 WITH CHECK(created_by=saas.current_actor() AND status='matched' AND operations.allowed(company_id,'procurement:write'));
GRANT INSERT ON operations.invoice_matches TO vtv_saas_runtime;
COMMIT;

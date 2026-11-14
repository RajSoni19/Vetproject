-- REVIEW ONLY. Corrects the accepted operation vocabulary for existing idempotency keys.
-- It changes no row, role, grant, RLS policy or financial record.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.materials') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check'
               AND pg_get_constraintdef(oid)=E'CHECK ((operation = ANY (ARRAY[\'contact.save\'::text, \'invoice.create\'::text, \'invoice.replace\'::text, \'invoice.confirm\'::text, \'invoice.attach\'::text])))')
 THEN RAISE EXCEPTION 'Unapproved target, prerequisite or command-key state'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK(operation IN(
 'contact.save','invoice.create','invoice.replace','invoice.confirm','invoice.attach',
 'operations.material.create','operations.warehouse.create','operations.purchase-request.create',
 'operations.purchase-request.approve','operations.purchase-order.create','operations.goods-receipt.create',
 'operations.stock.adjust','operations.stock.transfer','operations.sales-order.create','operations.sales-order.transition'
));
COMMIT;

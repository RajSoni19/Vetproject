-- REVIEW ONLY. Preserve verified quotes, contacts and dispatch history.
-- This rollback refuses to remove marketplace tables if any contain data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('operations.shopping_supplier_offers') IS NULL
 OR to_regclass('operations.shopping_supplier_whatsapp') IS NULL
 OR to_regclass('operations.shopping_dispatches') IS NULL
 OR to_regclass('operations.shopping_dispatch_lines') IS NULL
 OR to_regprocedure('operations.guard_shopping_dispatch_update()') IS NULL
 THEN RAISE EXCEPTION 'Unapproved target or marketplace migration state'; END IF;
 IF EXISTS(SELECT 1 FROM operations.shopping_supplier_offers LIMIT 1)
 OR EXISTS(SELECT 1 FROM operations.shopping_supplier_whatsapp LIMIT 1)
 OR EXISTS(SELECT 1 FROM operations.shopping_dispatches LIMIT 1)
 OR EXISTS(SELECT 1 FROM operations.shopping_dispatch_lines LIMIT 1)
 THEN RAISE EXCEPTION 'Marketplace tables contain data; export and review before rollback'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP TRIGGER shopping_dispatch_update_guard ON operations.shopping_dispatches;
DROP FUNCTION operations.guard_shopping_dispatch_update();
DROP TABLE operations.shopping_dispatch_lines;
DROP TABLE operations.shopping_dispatches;
DROP TABLE operations.shopping_supplier_whatsapp;
DROP TABLE operations.shopping_supplier_offers;
COMMIT;

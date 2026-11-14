-- REVIEW ONLY. Registers only the three marketplace write operations.
-- Existing command vocabulary and all authorization controls remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ DECLARE constraint_definition text; BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.command_keys') IS NULL
 OR to_regclass('operations.shopping_supplier_offers') IS NULL
 OR to_regclass('operations.shopping_supplier_whatsapp') IS NULL
 OR to_regclass('operations.shopping_dispatches') IS NULL
 OR to_regclass('operations.shopping_dispatch_lines') IS NULL
 OR to_regprocedure('operations.guard_shopping_dispatch_update()') IS NULL
 OR to_regprocedure('operations.allowed(uuid,text)') IS NULL
 OR to_regprocedure('saas.current_actor()') IS NULL
 OR (SELECT count(*) FROM pg_class WHERE oid=ANY(ARRAY[
   to_regclass('operations.shopping_supplier_offers'),
   to_regclass('operations.shopping_supplier_whatsapp'),
   to_regclass('operations.shopping_dispatches'),
   to_regclass('operations.shopping_dispatch_lines')
 ]) AND relrowsecurity AND relforcerowsecurity)<>4
 OR NOT EXISTS(
   SELECT 1 FROM pg_constraint
   WHERE conrelid='business.command_keys'::regclass
     AND conname='command_keys_operation_check' AND contype='c' AND convalidated
 )
 THEN RAISE EXCEPTION 'Unapproved target or missing marketplace authorization prerequisites'; END IF;

 SELECT pg_get_constraintdef(oid) INTO STRICT constraint_definition
 FROM pg_constraint
 WHERE conrelid='business.command_keys'::regclass
   AND conname='command_keys_operation_check' AND contype='c' AND convalidated;
 IF position('ors.shopping.cart.add' IN constraint_definition)=0
 OR position('ors.shopping.catalogue.supplier' IN constraint_definition)=0
 OR position('ors.shopping.offer.configure' IN constraint_definition)>0
 OR position('ors.shopping.whatsapp.configure' IN constraint_definition)>0
 OR position('ors.shopping.checkout' IN constraint_definition)>0
 OR EXISTS(
   SELECT 1 FROM business.command_keys
   WHERE operation IN ('ors.shopping.offer.configure','ors.shopping.whatsapp.configure','ors.shopping.checkout')
 )
 THEN RAISE EXCEPTION 'Command-key vocabulary is not the expected pre-migration state'; END IF;
END $$;

SET LOCAL ROLE vtv_saas_owner;
DO $$ DECLARE original_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression
 FROM pg_constraint
 WHERE conrelid='business.command_keys'::regclass
   AND conname='command_keys_operation_check' AND contype='c' AND convalidated;
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format(
  'ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation IN (%L,%L,%L))',
  original_expression,
  'ors.shopping.offer.configure',
  'ors.shopping.whatsapp.configure',
  'ors.shopping.checkout'
 );
END $$;
RESET ROLE;
COMMIT;

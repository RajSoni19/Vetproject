-- REVIEW ONLY. Add one routing command without changing accepted vocabularies.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster' OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('invoice_routing.purposes') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check' AND contype='c' AND pg_get_constraintdef(oid) LIKE '%bank.reconciliation.reverse%' AND pg_get_constraintdef(oid) NOT LIKE '%document.purpose%')
 THEN RAISE EXCEPTION 'Unapproved routing command target/state';END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DO $$ DECLARE original_expression text;BEGIN
 -- Preserve the entire installed expression verbatim, including every accepted
 -- ORS, invoice and banking command. No role, RLS or data changes.
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check';
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format('ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation=%L)',original_expression,'document.purpose');
END $$;
RESET ROLE;
COMMIT;

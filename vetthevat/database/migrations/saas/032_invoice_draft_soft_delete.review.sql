-- REVIEW ONLY. Requires separate explicit approval before execution.
-- Audited soft deletion for drafts; confirmed accounting records remain immutable.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('business.invoices') IS NULL
 OR to_regclass('business.invoice_revisions') IS NULL
 OR to_regclass('saas.audit_events') IS NULL
 OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='business' AND table_name='invoices' AND column_name IN('deleted_at','deleted_by'))
 THEN RAISE EXCEPTION 'Unapproved target, missing prerequisite, or soft-delete schema already exists'; END IF;
END $$;

SET LOCAL ROLE vtv_saas_owner;
ALTER TABLE business.invoices ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by uuid REFERENCES web_auth.users(id);
ALTER TABLE business.invoices ADD CONSTRAINT invoice_soft_delete_pair CHECK ((deleted_at IS NULL)=(deleted_by IS NULL));
ALTER TABLE business.invoices ADD CONSTRAINT invoice_soft_delete_draft_only CHECK (deleted_at IS NULL OR state='draft');
CREATE INDEX invoices_live_listing ON business.invoices(company_id,state,direction,issued_on,id) WHERE deleted_at IS NULL;

DO $$ DECLARE original_expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression
 FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check';
 IF original_expression LIKE '%invoice.delete%' THEN RAISE EXCEPTION 'Invoice delete command already exists; inspect schema'; END IF;
 ALTER TABLE business.command_keys DROP CONSTRAINT command_keys_operation_check;
 EXECUTE format('ALTER TABLE business.command_keys ADD CONSTRAINT command_keys_operation_check CHECK ((%s) OR operation=%L)',original_expression,'invoice.delete');
END $$;

GRANT UPDATE(deleted_at,deleted_by,version,updated_at) ON business.invoices TO vtv_saas_runtime;
COMMIT;

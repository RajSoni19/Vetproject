-- REVIEW REQUIRED. Proposal only; never run during startup/build/import.
-- Target: the approved isolated local database only.
-- Adds a validated account language preference for a future session-bound API.
-- This file does not execute itself and has not been applied.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev'
 OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>55440
 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 OR current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999
 OR to_regclass('web_auth.users') IS NULL
 OR to_regclass('web_auth.installation') IS NULL
 OR NOT EXISTS(SELECT 1 FROM web_auth.installation WHERE version=1)
 OR EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='web_auth' AND t.relname='users' AND a.attname='preferred_locale' AND a.attnum>0 AND NOT a.attisdropped)
 THEN RAISE EXCEPTION 'Unexpected target or existing/missing web-auth schema'; END IF;
END $$;
SET LOCAL ROLE vtv_web_owner;
ALTER TABLE web_auth.users ADD COLUMN preferred_locale text NOT NULL DEFAULT 'en-GB'
 CHECK(preferred_locale IN('en-GB','hi-IN','gu-IN','es-ES','fr-FR','ar','pt-PT','de-DE','it-IT','pl-PL','ur-PK','pa-IN'));
GRANT UPDATE(preferred_locale) ON web_auth.users TO vtv_web_runtime;
RESET ROLE;
COMMIT;

-- REVIEW ONLY. NOT APPROVED OR EXECUTED. Additive to milestone-4a empty
-- baseline ONLY, never apply blindly to an existing database or original draft.
-- Run only as a separately approved atomic migration after owner/ACL evidence.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT IN ('vetthevat_dev','vetthevat_test')
 OR current_user::text <> current_database() || '_owner'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'Unapproved database or owner'; END IF;
 IF to_regclass('vat.context_tickets') IS NULL OR to_regclass('vat.invoice_usage') IS NULL
 THEN RAISE EXCEPTION 'Reviewed milestone-4a baseline required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_default_acl d,LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
  AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION 'Review creator default privileges before migration'; END IF;
END $$;
ALTER TABLE vat.documents DROP CONSTRAINT documents_mime_type_check;
ALTER TABLE vat.documents ADD CONSTRAINT documents_mime_type_check CHECK(mime_type IN
 ('application/pdf','image/jpeg','image/png','image/webp','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
CREATE TABLE vat.extraction_jobs (
 company_id uuid NOT NULL, document_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('queued','processing','ready','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token uuid, lease_until timestamptz CHECK(isfinite(lease_until)),
 result jsonb, failure_code text CHECK(failure_code IS NULL OR failure_code='EXTRACTION_FAILED'),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,document_id),
 FOREIGN KEY(company_id,document_id) REFERENCES vat.documents(company_id,id),
 CHECK((status='processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
       (status<>'processing' AND lease_token IS NULL AND lease_until IS NULL)),
 CHECK(status<>'ready' OR result IS NOT NULL), CHECK(status<>'failed' OR failure_code IS NOT NULL)
);
ALTER TABLE vat.extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat.extraction_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON vat.extraction_jobs FROM PUBLIC;
CREATE INDEX extraction_queue ON vat.extraction_jobs(company_id,status,lease_until);
-- Narrow aggregate helper: never grant runtime SELECT of every company ledger
-- row merely to obtain an account count. Owner-only read policy is required
-- because FORCE RLS also applies to the NOLOGIN function owner.
DO $$ BEGIN
 EXECUTE format('CREATE POLICY quota_owner_read ON vat.invoice_usage FOR SELECT TO %I USING (true)',current_user);
 EXECUTE format('CREATE POLICY quota_owner_read ON vat.usage_periods FOR SELECT TO %I USING (true)',current_user);
END $$;
CREATE FUNCTION vat.account_invoice_usage(selected_company uuid,selected_account uuid,selected_period uuid) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,vat AS $$
DECLARE used bigint;
BEGIN
 IF NOT vat.authorized_company(selected_company,'invoices:write')
 OR NOT EXISTS(SELECT 1 FROM vat.companies c WHERE c.id=selected_company AND c.billing_account_id=selected_account)
 OR NOT EXISTS(SELECT 1 FROM vat.usage_periods p WHERE p.id=selected_period AND p.account_id=selected_account)
 THEN RAISE EXCEPTION 'Account usage unavailable' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO used FROM vat.invoice_usage
  WHERE account_id=selected_account AND period_id=selected_period AND state IN ('pending','committed');
 RETURN used;
END $$;
REVOKE ALL ON FUNCTION vat.account_invoice_usage(uuid,uuid,uuid) FROM PUBLIC;
COMMIT;
-- No grants/policies: fails closed. Runtime and worker grants must be approved
-- with broker, audit, idempotency and quota aggregate access as ONE release.

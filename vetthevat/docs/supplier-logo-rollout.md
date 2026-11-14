# Supplier logo rollout

## Review status

`database/migrations/saas/036_supplier_logo_assets.review.sql` was applied to the local development database only.

- SHA-256: `54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4`
- No production database was changed.
- Target guard: local development database `vtv_saas_dev` on `127.0.0.1:55440`, approved operator role, and the expected Stage B schema.
- The migration adds only a supplier-logo schema version table, a private asset registry, a separate inspection queue, tenant RLS policies, and worker claim/finish functions. It does not alter invoice, document, extraction, VAT, or OCR tables.
- Do not apply it until the user approves the exact migration and checksum.
- Runtime activation is limited to the approved local development profile; no production or managed deployment is enabled by this change.

The local logo worker exposed an ambiguous `a.state` reference in `business.claim_supplier_logo_inspection()`. The review-only correction is `database/migrations/saas/038_supplier_logo_claim_alias_fix.review.sql`.

- SHA-256: `8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087`
- It replaces only that function, checks the exact currently installed function hash, and renames the target-table alias to `asset_row`.
- It does not create or alter tables, touch queued jobs, or change grants.
- It has not been applied; separate explicit approval is required.

## Storage and scan lifecycle

The manual purchase-invoice form uses the private storage provider selected by the existing local/S3/R2 adapter. The local adapter stores content-addressed `.asset` objects in the same approved private LocalAppData root as originals; the object namespace and registry remain distinct from invoice PDFs. The default upload limit is 2 MiB and can be set with `SAAS_SUPPLIER_LOGO_MAX_BYTES` from 256 KiB through 5 MiB.

An upload is atomically persisted before its pending asset and dedicated scan job are committed. The separate `supplier-logo` worker reads the exact bytes and calls the existing isolated ClamAV-plus-decoder endpoint. Only a clean receipt makes the image current and retrievable. Pending, rejected, and removed assets are never served. The authorized content endpoint uses the company session and `contacts:read`; it is not a public URL.

After an approved migration, the feature additionally requires the explicit runtime settings:

- `SAAS_SUPPLIER_LOGOS_ENABLED=1`
- `SAAS_SUPPLIER_LOGO_SCHEMA_SHA256=54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4`
- `SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256=8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087` (only after migration 038 is approved and applied)

In WSL, start only the supplier-logo worker with `npm run local:workers -- --supplier-logo-only`. This mode does not start the existing invoice inspection or extraction workers and therefore does not claim their queued jobs.

## Migration 038 rollback plan (not executed)

Migration 038 changes only the claim-function implementation and makes no data or table changes. The safest rollback is operational: stop the supplier-logo worker and disable the logo activation settings; leave the corrected function in place. Restoring migration 036's original function body would reintroduce the confirmed claim failure and is not recommended. If a database-level function restore is explicitly required, first stop the worker and take a verified backup, then separately approve a guarded `CREATE OR REPLACE FUNCTION` restoration of the original 036 body.

## Migration 036 full-feature rollback plan (not executed)

Stop the supplier-logo worker, disable both feature settings above, and ensure no scan lease is active. Export any supplier-logo records that must be retained. The following guarded, owner-scoped rollback removes only the objects introduced by migration 036; it does not delete private storage objects or change existing business tables:

```sql
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_database()<>'vtv_saas_dev' OR host(inet_server_addr())<>'127.0.0.1'
 OR inet_server_port()<>55440 OR session_user<>'vtv_saas_operator' OR current_user<>session_user
 OR replace(current_setting('data_directory'),E'\\','/')<>'D:/vetthevat.saas-dev/cluster'
 THEN RAISE EXCEPTION 'Unapproved rollback target'; END IF;
END $$;
SET LOCAL ROLE vtv_saas_owner;
DROP FUNCTION business.finish_supplier_logo_inspection(uuid,uuid,text,text,text);
DROP FUNCTION business.claim_supplier_logo_inspection();
DROP TRIGGER supplier_logo_guard ON business.supplier_logo_assets;
DROP FUNCTION business.check_supplier_logo();
DROP TABLE business.supplier_logo_jobs;
DROP TABLE business.supplier_logo_assets;
DROP TABLE business.supplier_logo_schema_version;
COMMIT;
```

Rollback intentionally leaves the content-addressed private image objects in place: deleting them requires a separate integrity-checked storage cleanup after confirming no live or recoverable references remain.

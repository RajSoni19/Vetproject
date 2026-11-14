# Document attachment trigger correction — 26 October 2026

Not applied. Requires separate approval.

- File: `database/migrations/saas/018_document_attachment_trigger.review.sql`
- SHA-256: `2654149faa1d933bf908c61ab7a6cf68ddc7a2fe2c132ade27a0197eb52574c1`
- Target: only PostgreSQL 17 at `127.0.0.1:55440/vtv_saas_dev`, cluster `D:/vetthevat.saas-dev/cluster`, verified installation, operator `vtv_saas_operator`.
- Current trigger definition must have SHA-256 `c27b34e47d1da2f351e797eb7c1a98c63d74038a9845dbe4e80b506fd358af77`; the runner and SQL refuse a changed or already-corrected definition.

Chrome acceptance found that inserting a draft invoice attachment raises PostgreSQL `42703`: `record "new" has no field "object_version"`. The shared trigger uses an AND condition referencing extraction-only columns while processing an attachment row. PostgreSQL plans the expression against the concrete row type. Migration 018 replaces only `business.check_draft_child()` and nests the extraction-specific expression inside its own IF statement. Authorization, draft checks, quarantine checks for extraction, trigger bindings and grants are preserved. It creates no tables and changes no financial records. Migrations 014–017 are not rerun.

Before execution, the reviewed runner creates a new private timestamped database custom dump and roles dump, verifies their SHA-256 checksums and a readable archive listing, and rechecks target/installation/source hash. Backup location: `D:/vetthevat.saas-dev/backups/migration-018-document-attachment-trigger-before-<timestamp>-<uuid>/`. The immutable backup is untouched.

If COMMIT is not acknowledged, preserve the backup and cluster and inspect; never retry automatically. After an acknowledged commit, disable document intake if a defect is found. Any restoration of the previous function or backup requires separate approval. Database restore must use a fresh approved target; never restore over the running cluster, 55439 or production. The previous trigger definition is retained in migration 003 and the fresh archive.

Validation after approval: real PostgreSQL attachment to a writable draft, cross-company denial, quarantined-confirmation denial, unchanged financial line insertion/deletion and unchanged extraction clean-version checks, followed by Chrome desktop/mobile acceptance.

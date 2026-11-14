# Stripe Checkout URL validation correction — 26 October 2026

Not applied. Separate approval required.

- File: `database/migrations/saas/021_stripe_checkout_url_check.review.sql`
- SHA-256: `d0855aa14733375f1aef905f6ea331a6610b00f3bcb9ee11f9963012f4f904e4`
- Only target: PostgreSQL 17 `127.0.0.1:55440/vtv_saas_dev`, cluster `D:/vetthevat.saas-dev/cluster`, matching installation and `vtv_saas_operator` session.
- Exact existing function definition hash: `829a19acd8dc56f9f82aed882f61d5e3adab6360c923596dc845937df1e17e26`.

The first real PostgreSQL billing test found an application SQL defect in migration 020: its Checkout URL regex uses `{1,2000}`, exceeding PostgreSQL's repetition-count limit. Grammar parsing did not execute this regex. Migration 021 replaces only `saas.complete_stripe_checkout()` with a separate length check and a `+` regex. The replacement regex has been executed successfully in a read-only PostgreSQL SELECT. Ownership, request key and provider ID checks are preserved. It changes no records, table definitions, grants or entitlements. Migration 020 is not modified or rerun.

Before execution: fresh timestamped custom database and roles-only backups under `D:/vetthevat.saas-dev/backups/migration-021-stripe-checkout-url-before-<timestamp>-<uuid>/`; verify SHA-256 and a readable archive listing. Recheck target, installation, migration hash and exact existing function hash. The immutable backup is untouched.

On failure/uncertain COMMIT: preserve cluster and backups, inspect, and do not retry. After acknowledged commit, keep billing disabled until tests pass. Any function rollback or database restoration needs separate approval; a database restore must use a fresh target, never overwrite 55440, 55439 or production. The previous function is retained in migration 020 and the verified archive.

Re-run real PostgreSQL billing tests with fixture provider transport after approval. These tests cannot prove real Stripe service functionality. The application billing gate requires both 020 and 021 checksum selectors and real test provider configuration.

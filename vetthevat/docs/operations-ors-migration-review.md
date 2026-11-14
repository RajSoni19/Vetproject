# ORS operations migration review — 23 October 2026

`database/migrations/saas/006_operations_ors.review.sql` is review-only and has
not been executed.

- SHA-256: `9dfe3dee8b277ae48a33b114752863b27c5e2529ed2b6a7c9c393baa04310758`
- Intended target: only `127.0.0.1:55440/vtv_saas_dev` in
  `D:\vetthevat.saas-dev\cluster`.
- Prerequisites: committed Stage A and corrected Stage B invoice schema; no
  operations schema may already exist.

## Objects

The migration creates schema `operations`; 17 company-scoped tables for
materials, warehouses, locations, purchase requests/orders and lines, receipts
and lines, immutable inventory movements, reservations, transfers, sales orders
and lines, fulfilments, and invoice matches; one inventory query index; four
transactional stock/receipt/sales transition functions; and forced RLS policies
on every operations table.

The existing `vtv_saas_runtime` receives only schema/table access constrained by
live company RLS and four narrowly named functions. `vtv_web_runtime` and
`vtv_saas_provider_runtime` are explicitly denied operations-schema access.
No role, account, entitlement, provider credential, financial record, or
existing row is created or changed by this migration.

## Backup and rollback

Before execution, the guarded operator must re-check target, cluster path,
PostgreSQL 17 version, migration checksum, and absent `operations.materials`,
then make a fresh custom database dump plus role dump, archive listing, and
checksums. SQL is one transaction. On failure or uncertain commit, preserve the
isolated cluster and backups for inspection; do not retry, drop, or overwrite.
A restore drill needs a fresh separately approved target.

## Pending implementation

The server command service and unmounted API dispatcher are ready for the
tables/functions above. The currently active route does not import the
dispatcher, so no ORS endpoint or browser UI is enabled before live RLS,
cross-company, idempotency, rollback, stock-concurrency, and browser tests pass.

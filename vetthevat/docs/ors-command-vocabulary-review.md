# ORS idempotency command vocabulary review

- Migration: `database/migrations/saas/013_operations_command_vocabulary.review.sql`
- SHA-256: `c2acdf01166f7954550935a5b86c961e30cd3e56c826036488aa093d425e444b`
- Target: isolated PostgreSQL 17 at `127.0.0.1:55440/vtv_saas_dev` only.
- Status: separately approved and committed 24 October 2026 after a verified
  database and role backup; the execution record is in the private backup
  directory.

## Security analysis

This migration changes only the named CHECK constraint on
`business.command_keys.operation`, adding the exact location-create,
purchase-request-reject and supplier-invoice-match operation identifiers used
by application code. It does not alter key/payload hashing, uniqueness,
company/actor/permission scope or response replay. It adds only a runtime INSERT
grant and RLS policy for `operations.invoice_matches`; the policy requires the
live actor, matched status and `procurement:write` capability. A transaction-local
lock timeout bounds DDL waiting. Preconditions reject a
different database, host, port, operator, cluster path, PostgreSQL major, absent
ORS tables, missing rejection function or unexpected old constraint shape.

## Rollback plan

The statement is transactional, so an execution failure rolls back. Before
approved execution, use the guarded runner to create and verify a fresh custom
database dump, roles-only dump, archive listing and checksums. A rollback would
require a separately reviewed migration restoring the prior exact CHECK list,
dropping the new insert policy and revoking its grant; it would fail if any
existing command key uses one of the newly allowed names. Do not drop rows or
restore the database automatically. Preserve the isolated cluster and backups
for inspection if commit status is uncertain.

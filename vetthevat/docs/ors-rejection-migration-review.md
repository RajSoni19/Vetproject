# ORS draft requisition rejection migration

- File: `database/migrations/saas/012_operations_purchase_request_rejection.review.sql`
- SHA-256: `5732338ef0120e6eb2c59bf363b805fc6a0af3bd5dff04c95afcb700c4227640`
- Target: isolated PostgreSQL 17 at `127.0.0.1:55440/vtv_saas_dev` only.
- Result: approved and committed 24 October 2026 after a verified database and
  role backup; execution record is in the private backup directory.

## Security review

The SECURITY DEFINER function has a fixed `pg_catalog,saas,operations` search
path and accepts only a company, requisition, expected version and actor. It
checks `saas.authorized_company(..., 'procurement:approve')` and requires the
passed actor to equal `saas.current_actor()`. Its update predicate permits only
the matching company row in `draft` state at the expected version, then moves it
to `cancelled` and increments the version. No browser-supplied role or company
scope bypass is added. PUBLIC execution is revoked and only the existing
`vtv_saas_runtime` role receives EXECUTE. There are no table, RLS, ownership,
role, password or financial record changes.

## Rollback plan

The SQL is transactional. Before execution, the guarded migration runner made a
fresh custom database dump, roles-only dump, archive listing and SHA-256 checks
in a private timestamped backup. If the commit had failed or been uncertain,
the safe action was to preserve the cluster and backup for inspection. A
rollback would require a separately reviewed and approved migration that
revokes runtime EXECUTE and drops this function; no automatic rollback or
restore was run. The acknowledged commit and backup checksums were recorded by
the runner.

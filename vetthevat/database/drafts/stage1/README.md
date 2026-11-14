# Stage 1 candidate extension — DO NOT EXECUTE

This is unapproved SQL for a database containing the **milestone-4a candidate
baseline**, not the older `001_initial_schema.sql` or older review drafts. There
is no approved target schema in the supplied repository. Neither the baseline
nor this extension was executed, parsed by PostgreSQL, or tested against a server.

The extension adds WEBP metadata, a company-qualified extraction-job table with
bounded attempts and fenced leases, and a narrow account-usage aggregate helper.
The helper rechecks trusted company authorization and the account/period linkage
before counting all companies' committed and pending usage. This avoids the
undercount that ordinary company-only RLS would cause. TypeScript locks the billing
account before calling it; the whole invoice save, quota entry and audit commit
or roll back together. Never release usage based solely on an expired lease.

Ownership and creator default-ACL checks stop on an unexpected role/default
grant. The file is transactional and uses no IF NOT EXISTS to conceal conflicting
objects. PUBLIC access is revoked, FORCE RLS is enabled before commit, and the
SECURITY DEFINER helper fixes its search path. Two owner-only read policies support
the aggregate under FORCE RLS. These are a review proposal, not verified security.

No runtime/worker/broker privileges or write policies are supplied. Deployment
must approve and test those together, including access to subscriptions/periods,
account locks, idempotency, document jobs, append-only revisions/audit, and actor
identity bound to the context ticket. Tickets must authorize each read capability
needed by a write operation; granting only `invoices:write` cannot silently grant
unrelated contact/document reads. Do not broaden all table policies to work around
missing capabilities.

Before execution: review the existing verification outputs and actual cluster
identity, migration effective owner, global and schema default privileges, broker
isolation and helper privilege paths. Then approve exact file hashes, test-only
database target, execution identity, recovery procedure, and synthetic test scope.
Test two connections across companies, stale/replayed tickets, rollback/pool reuse,
same-key and changed-key retries, account quotas, allocation sums, and abandoned
storage objects. An unknown COMMIT outcome requires reconciliation rather than
automatic retry or original-file deletion.

No production credentials, connections, migrations, grants, subscriptions or
deployments are authorized by this file.

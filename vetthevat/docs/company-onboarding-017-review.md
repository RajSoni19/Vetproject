# Company onboarding migration review — 26 October 2026

Execution is **not approved and has not occurred**.

- File: `database/migrations/saas/017_company_onboarding.review.sql`
- SHA-256: `42881024af6488b131a6573fa825a19fffd6723604f38b50cb41dc2cdefd11db`
- Only target: PostgreSQL 17, `127.0.0.1:55440/vtv_saas_dev`, cluster `D:/vetthevat.saas-dev/cluster`, operator `vtv_saas_operator`. Existing installation UUID must match the private runtime configuration.
- Prerequisites: existing banking tables and corrected 016 allocation-lock policy. Migrations 014–016 are not rerun.

The change adds an RLS-protected idempotency table and two restricted functions. A live, verified identity can reserve one pending billing account and company. This creates no subscription or entitlement and grants no business access. An owner adding a company to an existing active account must have a verified active entitlement with an available company allowance. The account row is locked to serialize concurrent allowance checks. Session hashes resolve identities; browser-supplied user IDs and roles are never accepted. Application roles receive function execution, not direct onboarding/billing table access.

Owner policies allow inserting pending billing accounts, owner billing memberships and company profiles. Two owner row-lock policies allow locking accounts/entitlements but prohibit updates. The existing company authorizer and financial entitlement enforcement remain unchanged. The definer owner gains INSERT on the three identity company/membership/audit tables; application roles gain no new table writes.

Before SQL execution, the existing reviewed runner must create fresh custom-format database and roles-only backups under a new private `D:/vetthevat.saas-dev/backups/migration-017-company-onboarding-before-<timestamp>-<uuid>/` directory. It must list the archive and verify SHA-256 checksums for the database dump, roles dump and archive list. The immutable backup is never replaced. The runner rechecks the exact target, installation and SQL checksum before execution.

On a failure before acknowledged COMMIT, preserve the cluster and backup and inspect the transaction outcome. Do not retry automatically. After acknowledged COMMIT, disable the onboarding gate to contain defects. A data restore requires separate approval for a fresh target and a restore drill using the pre-migration archive and roles. Never restore over this cluster, port 55439, production or the immutable backup automatically. No destructive down migration is proposed because reservations may already exist.

After approval: run database concurrency, idempotency, revoked/unverified session, foreign account, pending-access denial and company-limit integration tests; then browser-test company reservation and provisioned company selection. Enable `SAAS_ONBOARDING_ENABLED=1` and the exact schema checksum only in the isolated application after those checks. Live Stripe billing, invitations and paid activation require subsequent work and separate schema/provider review.

Review command (does not connect or execute):

```powershell
node scripts/saas-reviewed-migration.cjs 017-company-onboarding
```

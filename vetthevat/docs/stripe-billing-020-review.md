# Stripe test billing schema review — 26 October 2026

Not applied. Requires separate approval. No Stripe credentials are provided or requested by this migration.

- File: `database/migrations/saas/020_stripe_billing.review.sql`
- SHA-256: `26f6316796c9eccc42ae59603bbe4ddbb61309a01738d9e282fe3f02df846cad`
- Target: only PostgreSQL 17 at `127.0.0.1:55440/vtv_saas_dev`, cluster `D:/vetthevat.saas-dev/cluster`, matching installation and operator `vtv_saas_operator`.
- Requires the existing provider inbox and approved team identity helper. Refuses an existing `saas.stripe_accounts` table.

Adds a forced-RLS private customer/subscription/Checkout binding table. Owner-authenticated functions verify live sessions and account ownership, bind customers, serialize Checkout reservations and persist provider receipts. One unresolved Checkout is retained per account; retries reuse the same request and returning from Checkout never grants access. Hosted provider URLs are validated. A customer already bound elsewhere cannot be rebound. Existing subscriptions use the Billing Portal rather than duplicate Checkout subscriptions.

The provider worker receives execute-only claim/finish functions, with no direct billing or entitlement table write access. It receives SELECT on the non-sensitive schema installation table so the existing runtime preflight can verify its installation. Claims serialize reconciliation per customer, use 120-second leases, retry with capped exponential backoff and fail after ten attempts. Unsupported events are ignored. Expired Checkout events clear only the matching Checkout reservation.

Application worker code fetches current Stripe test customer/subscription state, verifies account metadata, stored customer/subscription identities, approved GBP monthly Price IDs, exact amounts, unit quantity and the Basic-only ORS add-on. Active, past-due, cancelled and pending states map to fixed database plan allowances. Trial/paused states do not grant paid access. The database repeats test-mode and stored-binding checks, derives quotas itself, updates entitlement versions and activates only pending company profiles after verified active state. Past-due/cancelled accounts are suspended. Billing reconciliation writes an identity audit record. Existing invoice/ORS/team allowance checks consume those authoritative entitlements.

The no-login definer owner receives owner-only policies for subscription/account/profile activation; browser-facing roles receive no direct table writes. The dedicated provider role is a trusted worker boundary: protect its credential separately from the web runtime. No password is created, no worker scheduled, no provider contacted and no live key accepted by this migration. Protocol tests use injected provider responses; they are not real Stripe acceptance.

Backup: before execution, the reviewed runner creates fresh database custom-format and roles-only dumps under `D:/vetthevat.saas-dev/backups/migration-020-stripe-billing-before-<timestamp>-<uuid>/`, verifies SHA-256 checksums and a readable archive listing, then rechecks target, installation and SQL checksum. The immutable backup and migrations 014–019 are untouched.

Rollback: on error or uncertain COMMIT, preserve cluster and backups, inspect and do not retry. After acknowledged COMMIT, disable `SAAS_STRIPE_BILLING_ENABLED`, the Stripe provider flags and worker trigger to contain defects. Restoring previous data/schema requires separate approval to a fresh target. Never restore over 55440, 55439 or production automatically. No destructive down migration is supplied because billing records may already exist.

After approval: real PostgreSQL owner/cross-account, Checkout concurrency/idempotency, binding uniqueness, lease expiry, duplicate/stale event, entitlement/revocation and transaction rollback tests using synthetic provider state. Then obtain isolated Stripe test keys, approved Price IDs/API version/webhook signing secret and dedicated provider-runtime credentials privately. Real hosted Checkout, portal, signed webhook and provider-state browser acceptance remains a release gate. Production payments need their own implementation/configuration review; this adapter deliberately supports test mode only.

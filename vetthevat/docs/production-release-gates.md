> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Production release gates — NO-GO

This checklist does not authorize deployment or provisioning. The local
PostgreSQL instance is not production infrastructure and must stay loopback-only.
The existing Flutter, Firebase, mobile customer services, DNS and current Vercel
deployment remain excluded. Do not reuse their credentials or databases.

## Required sequence

1. Complete isolated company onboarding, team lifecycle and operator-reviewed
   administrator setup. Keep software administration separate from company
   finance permissions. Approve exact new schema hashes before execution.
2. Approve and test Stage B 003 plus private storage/scanning/OCR, verify actual
   tenant isolation, quotas, transactions, worker recovery and durable invoice
   review/confirmation/corrections. Connect existing UI only to accepted services.
3. Implement and separately approve procurement, inventory, sales and fulfilment
   migrations/commands. Verify no duplicate posting or unauthorized negative
   stock; race-test reservations, partial receipts/returns and invoice linking.
4. Implement banking allocation/reversals and statement deduplication; do not
   advertise live bank connectivity without a separately approved integration.
5. Configure an approved payment provider and verify signed webhooks, idempotent
   lifecycle events, billing portal authorization, entitlements, plan quotas,
   account-wide company/member limits and restoration after missed events. No
   browser field or unverified payment status can activate access.
6. Approve contact 004 independently of 003. Configure real spam checks, contact/
   lead database services and durable email workers. Provider acceptance and
   downstream delivery events are distinct; test both without exposing PII.
7. Complete administrator management/monitoring workflows, live security tests,
   dependency remediation, backups and an actual approved fresh-target restore.
8. Run acceptance against a separately approved staging environment that uses
   intended production adapter behavior. Record build ID, exact migration hashes,
   provider evidence, test counts and remaining limitations.

## Infrastructure and secrets

Provision only after separate approval: managed PostgreSQL with verified TLS,
restricted owner/migrator/web/business/worker roles, authenticated pooling,
separate staging/production identities, network restrictions, encrypted backups,
retention and recovery objectives. Prove runtime roles cannot alter schemas,
bypass forced RLS or assume owners. Never expose port 55440 to the internet.

The current `SAAS_BACKEND_ENABLED` configuration intentionally accepts only the
isolated local database. Changing an environment value is not a reviewed managed
production adapter. Stage A production authentication opt-ins likewise do not
prove the full SaaS is ready. Review production TLS/provider/connection/role/
installation preflight code before supporting a new target.

Document and provision server-only values for authentication database/TLS/
installation IDs, CSRF secret, encrypted outbox key, business database and
installation, versioned private object service and least-privilege credentials,
scanner/decoder/OCR worker identities, signed queue/worker dispatch, email provider
and verified sender, Turnstile, payment signing keys and monitoring transport.
Names not currently implemented must be defined together with their reviewed
adapter; do not invent environment variables that imply those integrations work.
Use a secret manager/deployment environment, never frontend `NEXT_PUBLIC_*`
credentials or source files. Review existing exact local variables in
`docs/stage-b-development-services.md` and authentication config code.

Workers need durable scheduling, bounded execution, restricted egress/filesystem,
dead-letter recovery and metrics for lease age, repeated failures, storage errors
and notification backlog. A Next.js request or in-memory promise is not durable
background execution. No scanner clean receipt may be substituted by header-only
checks. Originals need tested private/versioned retention and recovery.

Configure privacy-preserving structured logs and alerts without passwords,
sessions, token links, invoice contents, customer messages or raw provider errors.
Public health output must not expose internal identifiers or credentials. Verify
operational alerts through the intended transport; a static green card is not
evidence of service health.

## Deployment boundary

Build with all required production integrations configured in approved staging;
test direct navigation/refresh, real registration/recovery/password changes,
administrator and company permission separation, every enabled financial route,
mobile/desktop layouts, outbox retry and concurrent tenant activity. Scan built
client output for secret leakage. No legacy browser records may be imported
without approved ownership mapping.

Prepare a new release with an exact migration inventory, pre-change backups,
recovery/forward-fix plan, build artifact and environment checklist. Review Vercel
runtime limits and background-job hosting against actual adapters, not local
build success. Current production project settings, domain/DNS and mobile
services must remain unchanged until explicitly authorized. No publishing,
migration, domain switch or deployment is approved by this checklist.

Only an explicit deployment approval after **all** required financial, security,
service, restore, monitoring and browser gates pass can change the NO-GO decision.
`node scripts/release-readiness.cjs --write` inventories the present blockers;
it performs no service probes and always exits 2 while these blockers exist.

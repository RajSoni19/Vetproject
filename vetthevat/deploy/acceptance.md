# Historical deployment acceptance ledger — 27 October 2026

Current status and later approved migrations/tests: [final staging checkpoint](../docs/final-staging-checkpoint-2026-10-27.md). The ledger below records the earlier pre-feature deployment-package review; its test counts and “no new SQL” statement are historical.

**Controlled staging deployment: NO-GO. Production: NO-GO. Nothing deployed.**

The deployment package and explicit managed configuration branch are prepared. No VPS, managed PostgreSQL, Cloudflare, R2 or Stripe account was connected to during this work. No new SQL was executed or approved. Existing migrations 001–021 were inventoried offline without editing them. Protected 55439, production services, published applications and immutable backups were not used.

## Checks actually executed locally

| Check | Result and scope |
| --- | --- |
| Automated suite | **284 passed, 0 failed**. Includes existing ORS/banking/identity/storage tests plus managed profile/TLS-role guards, actual local certificate/hostname transport checks, storage fallback rejection, malformed/future/stale heartbeat rejection, exact runtime binding, archive verification/rejection and worker loop lifecycle checks. Sandbox subprocess EPERM was resolved by running the authorized local suite with subprocess execution available. |
| TypeScript | `npm run typecheck` passed. |
| Production application build | `npm run build` passed with Next 16.4.2 on Windows Node 22.15.1. This is not a Linux release artifact. |
| Bash/Python syntax | All Ubuntu and CI shell scripts passed Git Bash `-n`; Python verifier/fixture compilation passed. ShellCheck and Linux execution remain unexecuted. |
| Worker compilation | `npm run workers:build` passed; independent `.cjs` worker bundles produced. Compilation is not a successful managed worker run. |
| ORS actual Chrome (prior evidence, not rerun in this deployment review) | Passed on isolated 3444/55440: supplier/customer, materials, warehouses/locations, requisition/order, receipt, reservation/pick/pack/dispatch/return, validation/rollback, persistence, tenant isolation and 390/1440px layouts. Storage-disabled response passed. |
| Banking actual Chrome (prior evidence, not rerun in this deployment review) | Passed on isolated 3444/55440: accounts, CSV import/balances, duplicate denial, concurrent allocation, reversal/reconciliation/history, persistence, tenant isolation, CSRF/role denial and responsive layouts. |
| Offline staging/production rendering | Passed. Distinct loopback ports, users, sockets, profile paths and Nginx hostnames; no provider connection or secret read. |
| Archive behavioral checks | Valid synthetic archive extracted; secret-file, symlink and modified-content archives rejected before extraction. No service activation occurred. |
| Worker lifecycle | Graceful cancellation stops new claims; operation failure exits for supervision without immediate uncertain replay. This is a process-loop test, not a real crash/lease recovery drill. |
| Browser asset scan | 63 generated assets checked against one non-placeholder configured sensitive value and a private-key marker: zero matches. This limited exact-value check does not establish a complete secret/log audit. |
| Migration inventory | All accepted source checksums through corrected 021 match. `managedBootstrapReady=false`; nothing applied. |

The first ORS browser run used the launch server with private local storage enabled, so its explicit storage-disabled assertion timed out. It passed when rerun against the existing storage-disabled server configuration. This was an acceptance configuration mismatch; no ORS implementation was changed. Browser fixtures used new synthetic identities/companies in the existing isolated development database, not a staging/production database. Temporary Chrome artifact directories are outside the release package.

## Unexecuted acceptance gates

This Windows host has no usable WSL, Docker, Nginx or systemd. The prepared Ubuntu CI workflow, including its actual-rendered-vhost TLS/mTLS fixture, was **not run**, and no Linux release archive was produced here. Do not treat workflow YAML or unit hardening directives as test evidence.

| Gate | Evidence still required |
| --- | --- |
| Linux release | Clean Ubuntu build on pinned Node 22.23.4 x64, with immutable tool/image inputs/provenance; native dependencies resolved inside artifact; non-root standalone startup. |
| Nginx/Cloudflare | Actual rendered config syntax/TLS/mTLS route tests in prepared disposable CI, then real Cloudflare origin certificate and mTLS, strict TLS/WAF/cache rules, direct-origin denial, new-hostname scope and existing-site health preservation. |
| Managed PostgreSQL/RLS | Fresh separately approved provider baseline; verified CA/hostname; exact runtime/session roles, no ownership/admin membership, forced RLS, two-tenant denial, transaction and concurrency tests. |
| Independent services | Actual systemd validation on Ubuntu 24.04, dedicated UIDs, filesystem/socket/network denial, current release heartbeats, stop/restart ordering and real expired-lease recovery. |
| Private R2 and document processing | Real bucket/token/domain/lock/object tests, fresh ClamAV signatures, EICAR/corrupt/bomb/timeout tests, bounded real OCR and Chrome upload → clean → review → confirmation → authorized retrieval. |
| Stripe | Actual test Checkout/Portal, signed webhook delivery/replay/reordering, subscription changes/cancellation/failure/recovery and correct plan effects. Live billing remains unsupported. |
| SMTP | Existing loopback TLS Nodemailer evidence is retained; actual approved staging sink/provider TLS/sender/downstream acceptance remains pending. Customer mail remains disabled. |
| Recovery/operations | Manual verified encrypted offsite backup, separately approved fresh-target managed restore/PITR and originals recovery, actual crash-after-claim/uncertain-commit tests, rollback drill, real alerts, retention and capacity/soak measurements. |
| Functional release | Managed contact/bot/mail worker, support/admin/POS/detail/report coverage, complete downgrade/excess company/seat handling and plan history windows. |

No unresolved automated assertion failure remains in the final local runs. The gates above are **blocked or unexecuted**, not passed. Prior VAT/onboarding/team/SMTP browser evidence remains in the [accepted checkpoint](../docs/final-delivery-checkpoint-2026-10-26.md); it has not become managed-provider acceptance.

## Required inputs and approvals

Private inputs are listed in [architecture.md](architecture.md): approved hostnames/resources; separate managed clusters/CA/endpoints; fresh install IDs and restricted per-service credentials; R2 account/buckets/object and policy-read tokens; isolated Stripe test keys/prices/API version/signing secret; SMTP sink/provider configuration; Turnstile/contact inputs; backup/PITR/recovery destination; monitoring owners and destinations. Do not send secret values in chat.

Neon London, separate environments, app/staging hostnames and AMD64 were supplied by the user and are recorded in runtime.json/neon.md. Exact Neon direct endpoints, project/branch IDs and recovery-plan inputs are still required. No exact new executable migration is awaiting approval from this package. The role SQL is a design template. Once the managed provider and fresh targets are selected, prepare each concrete bootstrap/functional migration with exact filename, SHA-256, target, backup and rollback plan and obtain separate approval. Prior local 017–021 approvals do not authorize managed execution. The local-only database must never be relabelled as staging.

Host connection, Ubuntu installation, unit installation/start, Nginx reload, DNS/Cloudflare changes, provider activation and deployment remain separate future actions. The current request authorizes preparation only. Do not set acceptance booleans true without corresponding evidence and explicit release approval.

# Staging checkpoint — 27 October 2026

**Staging: NO-GO. Production: NO-GO. Nothing deployed.** This checkpoint supersedes earlier delivery/deployment ledgers. No VPS connection, DNS change, external provider activation or customer email occurred. Protected PostgreSQL 55439, immutable backups and production applications/data remain untouched.

## Completed acceptance

| Gate | Actual evidence | Boundary |
| --- | --- | --- |
| Automated regressions | **297 passed, 0 failed** after routing and procurement calculation changes. | Includes existing ORS/banking tests; not provider acceptance. |
| Application build and types | TypeScript and production Next.js build passed. | Windows Node 22.15.1; not a Linux artifact. |
| Worker compilation | Independent worker bundles compile successfully. | Not a managed worker deployment. |
| ORS | Ten real PostgreSQL scenarios passed again, including immutable inventory ledger, receipt limits and concurrent reservation rollback. Existing desktop/mobile Chrome ORS journey reran successfully. | Existing accepted module preserved. |
| Banking | Existing authenticated desktop/mobile Chrome journey reran successfully: CSV balances, duplicates, concurrent allocation, reversal, reconciliation/history, persistence, tenant isolation and CSRF/permissions. | No external bank provider connected. |
| Invoice POS/detail and reports | Four real PostgreSQL report scenarios passed: 51 confirmed records across two pages, exact decimal totals, filters, XLSX data and revocation denial. Chrome created/confirmed a sale, edited a customer, loaded exact report totals and downloaded the XLSX at 1440/390px. Invoice date serialization was corrected and checked. | Manual reviewed invoices; not OCR completion or full POS hardware/payment acceptance. |
| Support and administrator directory | Five real PostgreSQL scenarios passed: create/replay, immutable messages, tenant/table denial, version/closed-ticket rules and live membership/admin revocation. Authenticated Chrome created, replied to and closed a ticket; administrator directory loaded at 1440/390px, then immediately returned 403 after removing the synthetic grant. | Replies are in-app. No support email, owner transfer, deletion or unrestricted user management. Synthetic administrator grant was removed in cleanup. |
| Public-contact worker | Four real PostgreSQL/authenticated TLS loopback SMTP checks passed: raw table denial, exclusive lease/stale acknowledgement denial, one SMTP acceptance and durable receipt. | Operator used SET SESSION AUTHORIZATION for the synthetic worker identity; dedicated login credential and production delivery were not tested. Historical jobs were locked and not consumed. Turnstile browser submission remains unexecuted. |
| Upload routing | Four real PostgreSQL scenarios passed for ORS/VAT/Both persistence, duplicate original reuse, replay, concurrent version conflict, audit history and tenant/module denials. Chrome uploaded a synthetic private original, selected all three purposes, reopened the persisted choice and reuploaded without a second original. Desktop/mobile screenshots inspected. | Purpose metadata only. No procurement observation ingestion or automatic module record creation. Original stays quarantined; no stock or VAT claim is created. |
| Price calculation core | Eight focused calculation/routing tests are included in the 297-test suite: exact pack normalization, weighted costs, cutoff, comparable dimensions, ambiguous match rejection, duplicate observation and company isolation. | No PostgreSQL observation/catalog integration, price page or market publication. This is not working market intelligence. |
| Worker crash recovery | Actual document claimant subprocess killed after durable PostgreSQL claim; real 120-second lease expired without editing clocks/leases. Replacement received a new lease; stale acknowledgement was rejected; retry preserved quarantine. | Local synthetic operator-assumed worker identity, not managed worker credentials or scanner acceptance. |
| Deployment preparation | Eight shell scripts pass Bash syntax checks. Ubuntu CI has guarded systemd/web/isolated processing and actual ClamAV/OCR acceptance steps prepared. | GitHub Actions has not run. No Nginx/systemd/non-root Linux/rollback/ClamAV/OCR execution is claimed. |
| Health and backups | Read-only local health inventory passed and verifies latest approved migration 026 backup hashes. | Historical synthetic queues remain; no draining. No fresh-target restore drill. |
| Browser secret check | 63 generated assets checked against one configured non-placeholder private value and private-key markers; zero matches. | Limited exact-value check, not complete log/bundle secret assurance. |

Evidence is synthetic and gitignored under `.launch-acceptance/`: `release-browser.json`, `release-regressions.json`, `release-reports-postgres.json`, `support-postgres.json`, `contact-worker-postgres.json`, `invoice-routing-postgres.json`, `document-crash-postgres.json` and screenshots. Failures discovered during acceptance were corrected separately; final executed scenarios above pass. The procurement observation and provider gates below remain incomplete, rather than being counted as passing.

## Database execution record

Each file below received separate user approval for its exact checksum. The reviewed runner validated the existing installation and only `127.0.0.1:55440/vtv_saas_dev`; each execution first created fresh custom database/roles dumps, verified hashes and a readable archive listing, and received COMMIT acknowledgement. No password was provisioned. SQL remained unchanged after approval.

| Migration | SHA-256 |
| --- | --- |
| 022 support workflows | `b970d7ed9fb38e0d636ac5925f1716685045c28c51c57c0c3d97bacaec7ef9de` |
| 023 contact notification worker | `215e7921244578ec15b8881d752f3d5f3e75bce8b64f19891d2d637f3d823391` |
| 024 support administrator lock correction | `d3eae4179a6f1b023a7584589c7d8e72e01f580117a751ac47be0c5aadc5958a` |
| 025 invoice purpose routing | `a896aea6434140df72c679170aa8abc06fa3386de6670bde234f4c1d27ad83e5` |
| 026 routing command vocabulary correction | `3b8bd396a5fac014975cd1561850b9a171ec967e75bc47f7aefa660e6a747792` |

Actual tests found missing administrator grant-lock privileges in 022 and missing routing command vocabulary after 025. Their transactions failed safely; separately approved 024/026 correct those issues without editing accepted files or granting runtime role-table UPDATE. No prepared migration remains pending approval at this checkpoint. New catalog/observation, subscription enforcement and managed/fresh-target bootstrap changes need new exact-file/checksum/target/rollback approvals.

## Remaining release blockers and missing inputs

1. **Linux execution:** repository URL/branch, repository checkout and enabled GitHub Actions access are unconfirmed. The workspace has no Git metadata/remote, no usable Linux runtime, and no confirmed Actions connection. The authorized target is an ephemeral `ubuntu-24.04` AMD64 runner. Run the prepared workflow there and inspect artifacts before counting Linux build, real Nginx, non-root services, isolation, native scanner/OCR or rollback gates as passed.
2. **Neon:** separate staging/production projects/databases in AWS London eu-west-2; exact endpoints/database/installation identifiers, trusted CA files and separate owner/migration/runtime/worker credentials. Managed role/bootstrap SQL requires a provider-compatible reviewed plan and separate execution approval. Local-only SQL is not a Neon bootstrap. Local 55440 is not staging.
3. **R2 and document processing:** isolated private bucket/account/token/endpoint/version and audit configuration; isolated host running current ClamAV signatures and bounded OCR/decoder; dedicated database worker credentials. Clean retrieval, OCR correction, reviewed confirmation and the full VAT upload path have not passed end-to-end acceptance.
4. **Stripe:** isolated test secret/publishable keys, approved GBP plan/add-on Price IDs, pinned API version, webhook signing secret, provider-runtime credential and worker trigger secret. Hosted Checkout/Portal, real signed webhook delivery, failure/recovery, cancellation/change and replay remain unexecuted. Existing injected-transport PostgreSQL tests are not payment acceptance. Live billing remains disabled.
5. **SMTP and forms:** approved host/TLS/CA/sender/authentication, test-only sink/recipient policy, contact/lead runtime credentials, Turnstile site/secret keys and independent hash secrets. No real-provider mail or bot-protected public browser submission has passed. Leads require their separate managed database/configuration.
6. **Commercial enforcement:** complete downgrade handling for existing excess companies/seats and history windows remains unfinished. Tested new-company/invoice/invitation allowances and past-due denials do not establish complete enforcement.
7. **Procurement intelligence:** canonical products/company aliases, verified supplier-invoice identity and module links, PostgreSQL price observations, correction/cancellation/refresh jobs and Supplier Price Intelligence page remain unfinished. Cross-company sharing has no enabled publication path or grant. Privacy impact/legal/security review, explicit consent/withdrawal, cohort suppression and differencing resistance remain required. See [design and boundaries](procurement-intelligence-design.md).
8. **Operations:** fresh-target approved database bootstrap/restore drill, object backup recovery, dedicated-role worker crash/restart drills, scheduler, alert destination/log retention and managed secret rotation acceptance. Do not automatically restore over an existing database or drain historical fixture queues.
9. **Application coverage:** administrator directory/support are implemented, but broader administration, company detail management, complete report coverage and remaining POS capabilities are not all accepted backend functionality. No new financial UI introduced here relies on browser-local authoritative state; legacy source must not be described as accepted server features.

Staging stays **NO-GO** until the relevant Linux, database/provider, commercial enforcement, recovery and browser workflow gates actually pass. No deployment is authorized by this checkpoint.

## Reproduce local evidence

```powershell
npm test
npm run typecheck
npm run build
npm run workers:build
node tests/support-postgres.cjs
node tests/contact-worker-postgres.cjs
node tests/invoice-routing-postgres.cjs
node tests/release-reports-postgres.cjs
node tests/ors-postgres-integration.cjs
# Each browser driver starts/stops its own isolated server; run sequentially.
node tests/browser-release-workflows.cjs
node tests/release-regressions.cjs
npm run health:local
```

These commands require the existing approved isolated local schema; they run no migrations. Browser and worker tests need subprocess execution. The document crash drill takes at least 120 seconds and should not be rerun simply to inflate evidence. Staging/production environment flags remain disabled; local acceptance enables only its own process.

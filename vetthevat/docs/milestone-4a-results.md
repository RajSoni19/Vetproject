# Milestone 4A ? backend readiness and security remediation

20 October 2026. **Local preparation complete; release blocked.** No PostgreSQL
connection/SQL execution, migrations, production access, Firebase configuration,
Flutter changes, payments, emails, deployment, Git initialization or immutable
backup changes occurred. All installed dependency versions and the lockfile remain
unchanged. Working frontend persistence/OCR/VAT logic is retained.

## Delivered artifacts

| Deliverable | Files and actual status |
|---|---|
| Dependency inventory/remediation | `docs/milestone-4a-dependencies.json`, below; all 8 package findings investigated, no unsafe major/forced upgrade. CSV exposure removed from XLSX reader; XLSX containment added, not a patched-library claim. |
| Typed entitlements | `lib/server/entitlements.ts`, plan-aware `account-usage.ts`: owner-provided Basic/Starter/Growth limits and prices; missing plan fails closed. No subscription provider or usage/capacity ledger. |
| API/storage | `lib/server/business-contracts.ts`, `preparation.ts`: strict company/contact/invoice/filter/bank/allocation/reversal/upload validators; server-calculated decimal-string amounts; private versioned storage port, byte/signature/checksum checks. No enabled endpoint or DAL write. |
| Auth/session/authorization | `auth-preparation.ts`, existing `identity.ts`, `command-protocol.ts`: injected Firebase adapter and membership ports, capability matrix, secure cookie descriptor, recent sign-in and session-bound CSRF/origin checks; proposed broker-bound context. No SDK, verifier or live session. |
| Financial/parsing safety | `statement-csv.ts`, `statement-reader.ts`, `spreadsheet.worker.ts`, `components/bank-import.tsx`: CSV parsed independently; XLSX parser moved off main thread with timeout/size/output bounds. Existing manual mapping, dates/amounts/retry/reconciliation preserved. Server financial arithmetic parity-tested against unchanged frontend policy. |
| Monitoring | `lib/server/telemetry.ts`: explicit operation/request/status/duration allowlist; no request/error/header spreading. Not configured logging, alerts or observability. |
| Revised SQL | `database/drafts/milestone-4a/001_atomic_vat.review.sql`, README: alternative empty atomic baseline, billing/customers/capacity/quota, constraints/indexes, capability RLS and ticket proposal. **Not executed or PostgreSQL-validated.** Original drafts/verification scripts unchanged. |
| Integration plans | `docs/milestone-4a-auth-api-plan.md`, draft README: Firebase/mobile compatibility, role/capability/broker ownership, storage/CSRF/API contracts, concurrency and backup/rollback sequence. |
| Local plan presentation | Subscription allowance now explicitly plan-dependent/unavailable until verified; 100-invoice counter labelled Starter preview. Proposed plan descriptions reflect owner-provided GBP amounts/limits; no payment or ORS access activated. |

## Entitlement contract

| Plan | GBP/month | Shared invoices/month | Companies | Seats including owner | ORS metadata only |
|---|---:|---:|---:|---:|---|
| Basic | 9.00 | 30 | 2 | 2 (owner + 1) | Optional GBP 5.00/month |
| Starter | 15.00 | 100 | 2 | 4 (owner + 3) | Included |
| Growth | 25.00 | 300 | 3 | 6 (owner + 5) | Included |

Uploads and manual invoices share ONE billing-account counter across companies.
The account resolver supplies verified plan and period; request bodies cannot pick
a limit. Earlier universal 100-invoice assumption is superseded; 100 remains only
Starter metadata/local preview. Prices have not been created in a payment provider;
VAT inclusion/treatment, anniversary timezone, trials, past-due access, upgrades,
proration/refunds, draft/import counting and invitation/archived-company capacity
policies still need approval. ORS itself is not implemented. Reservations must be
atomic with company/member/invoice writes and use the trusted billing account.

## Dependency security findings and disposition

Fresh read-only npm audit: **6 high, 2 moderate, 0 critical** package findings.
Inherited package flags overlap underlying advisories; not 8 independent exploits.
No malicious exploit payloads were run. Source reachability is an inference from
imports/call sites, not a penetration-test result.

| Installed dependency | Finding/execution boundary | Minimal safe disposition |
|---|---|---|
| xlsx 0.18.5 | High prototype pollution (<0.19.3) and ReDoS (<0.20.2). Previous bank file reader ran arbitrary CSV/XLSX on main browser thread. Export-only generation is a distinct path. | **Applied:** CSV no longer calls XLSX.read; strict UTF-8 parser handles quoting/newlines/text amounts with byte/cell/column/row bounds. XLSX signature checked, parser in disposable worker, 15s timeout, <=20 sheets, 5,000 transactions/sheet, 100 columns, 2,000 chars/cell, 100,000 cells/2 MiB output text. No main-thread fallback. **Not fixed:** vulnerable library still parses XLSX; worker is not a security sandbox or hard heap limit. ZIP expansion can exhaust memory before bounds, prototype effects remain possible inside worker, main-origin network trust is not eliminated. Release still blocked. |
| braces 3.0.3 | High nested-pattern stack exhaustion; Tailwind build/watch chain, no uploaded document-to-glob API found. | Advisory lists no patched braces version. Treat repo/PR build inputs as untrusted code, keep isolated credential-free CI. Review replacing/removing chain; do not claim 3.0.3 is a fix for this newer advisory. |
| chokidar 3.6.0 | High inherited through braces; dev/watch execution. | Parent/watch-chain change needs compatibility review and Windows/Linux watch tests. No direct runtime call found. |
| micromatch 4.0.8 | High inherited through braces, Tailwind content globbing. | Upgrade/remove dependency chain only after actual resolved-tree review; an isolated bump may still retain braces. |
| fast-glob 3.3.3 | High inherited through micromatch/braces; build scanning. | npm says fix available but does not prove the advisory disappears without changing the chain. Validate emitted classes and content scanning after approved change. |
| postcss-selector-parser 6.1.4 | Moderate CPU exhaustion from hostile selectors; current use is repository CSS at build time. | Patched upstream 7.1.6; current parent uses older major. Do not force a potentially incompatible override. Review parent/engine/plugin compatibility and CSS snapshots. |
| postcss-nested 6.2.0 | Moderate inherited selector-parser risk, build-time nesting. | Review compatible parent transition; nesting/order/output can change. |
| tailwindcss 3.4.17 | High inherited through multiple above chains; dev dependency. No actual final container trace/absence proof. | npm suggests 4.3.3, a major version and potentially changed PostCSS integration/theme/scanning. Requires separate reviewed dependency/tooling approval; no automatic audit fix --force. |

### Exact dependency decisions requiring approval

Existing session package approval covered pg@8.16.3 and @types/pg@8.15.5 only.
No additional package installation was assumed for 4A. Safe package-free mitigations
above were applied; audit findings have not been suppressed or relabelled resolved.

1. **Candidate xlsx 0.20.3**, maintainer distribution
   `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Official docs currently
   recommend this source; old npm registry xlsx stops at 0.18.5. Approval must cover
   external artifact source and exact version, integrity/license/source review and
   lockfile change. No artifact was downloaded/installed or checksum invented.
   Candidate API still provides XLSX.read/utils; real compatibility is NOT proven
   without tests. Validate dates, formats, sheet selection, duplicate fingerprints,
   formula/text handling, worker packaging and every workbook/PDF/browser regression.
   Version minimums address the cited advisories, not a blanket security warranty.
2. Review Tailwind 4.3.3 migration and its exact PostCSS/plugin dependencies as a
   separately scoped change, or another maintained compatible path. Current npm
   recommendations do not establish a safe one-package patch. No version override
   or new lint/tooling dependency was installed. Selector parser 7.1.6 is an upstream
   fixed version, not an approved compatible override for the installed parent.

Sources: [SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/),
[prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
[ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9),
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[selector parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

## Database/authorization status

Owner reports previous runtime/dev-migrator checks. No new local DB connection was
made and no role matrix is independently re-verified here. Pending test migrator
and administrator evidence remains mandatory. New draft assumes only reviewed dev/
test names and explicit effective NOLOGIN owner, checks creator default ACLs and
creates schema/RLS atomically. No automatic schema down/reset or data loss path.

A runtime credential holder can forge ordinary app.user_id/company_id GUCs; a
membership predicate alone does not fix this. Proposed context broker independently
verifies identity/scope and stores a random ticket hash bound to transaction/PID/
role/company/expiry. Runtime cannot mint/read/write claims; role capabilities and
live membership still checked by RLS helper. New trust domain/privileges and the
SECURITY DEFINER path require separate owner approval and real SQL tests. No broker,
grants, write policies, working bootstrap or authenticated tenant isolation exists.

Financial aggregate integrity, canonical duplicate keys, append-only audit and
concurrent bank/quota/capacity commands remain to be implemented/tested on the
approved synthetic DB. Comments/ports do not enforce them. Prepared helpers bind
context locally and lock bank rows/invoices in deterministic order using constants
and UUID parameters, but no actual SQL/helper execution occurred.

## Release security review

- Dockerfile, .dockerignore, Compose and Actions reviewed against previous release
  report. Existing source allowlist excludes recovery/env/key/credential/database
  files; it cannot detect secrets embedded inside allowed source/public/test assets.
  No credential ARGs, workflow secrets, production configuration or image push added.
- Runtime image declares non-root node; Compose read-only filesystem, dropped
  capabilities, no-new-privileges, bounded resources and loopback port remain.
  Docker unavailable: no build/start/health/user/image-history/asset test claimed.
- CI retains commit-pinned actions, contents:read, no persisted checkout credentials,
  scripts-disabled npm ci, locked dependencies and a failing high-severity audit
  gate. No Git repository or hosted pipeline configured/executed. NODE_IMAGE still
  needs an approved digest; Node major/runner/browser inputs not fully reproducible.
- Server secrets stay behind server-only entry markers; config is lazy and fails
  closed. No NEXT_PUBLIC secrets or credential files created. Complete bundle/secret
  scanning, artifact SBOM/signature and registry policy remain release requirements.
- Rate limiting and quotas remain fail-closed interfaces without shared production
  store or enabled route enforcement. Review-only nginx config is not an installed
  perimeter. API errors redact unknown/internal failures; telemetry allowlist does
  not replace configured logs, monitoring, alerting and incident response.
- Existing CSP inline/WASM allowances retained to preserve Next/OCR. No strict-CSP
  certification claimed. Future verified Firebase/storage/payment origins require
  a reviewed allowlist, CSRF/session checks and browser tests; no live calls here.
- Existing next lint script is invalid under Next 16; no lint pass claimed. Backend
  activation requires role/RLS, concurrency and backup/restore proof, not just build.

## Preservation, validation and next sequence

Source originals: `.recovery/milestone-4a-20261020-212740`. New optional interfaces
are not wired to frontend persistence. Browser tests use isolated synthetic profiles;
no owner browser records exported/reset. Existing money/VAT/tax-classification/OCR
modules unchanged. Added parity calculation operates on decimal strings/BigInt with
the same approved line rounding; no historical records recalculated.

Final check results and file hashes are recorded in the 4A change inventory. A full
existing browser run passed actual CSV/XLSX import, OCR PDF/JPEG/PNG, retry/recovery,
manual/draft/confirmation, filtered and single-invoice exports, company/supplier,
team/settings and bank partial/split/reversal. Later small output/cookie-boundary
hardening is covered by unit tests and final build; final focused UI check recorded
separately. No fake data, successful persistence or authentication is introduced.

Next approvals, in order: dependency artifact/version review; pending DB admin/test-
migrator checks and synthetic SQL authorization; capability/broker/privilege matrix;
Firebase identity/SDK/session strategy; private storage/parser/malware provider and
restore; real command/idempotency/quota/audit integration; separately approved local
record migration/reconciliation. Production deployment remains entirely out of scope.

See `milestone-4a-auth-api-plan.md` for exact implementation stages and private
access needed. No passwords, tokens or keys should be supplied in chat.

## Actual final validation

- `npm run typecheck`: passed.
- `npm test`: **83 passed, 0 failed**. New coverage: explicit plan limits/fail-closed
  missing plan; CSV quoting/UTF-8 text bounds; actual synthetic XLSX worker output
  and invalid inputs; decimal parity/classifications/draft incompleteness; strict
  request/scoping/upload checksum validation; session descriptors, CSRF and wrong-
  company rejection; transaction binding/sorted locks via doubles; static SQL
  boundary/capability checks and monitoring redaction.
- `npm run build`: passed on final TypeScript/frontend source (43 static pages plus
  dynamic routes). No service activation at import or build time.
- Full browser suite `--stage2 --stage3 --milestone1 --milestone2 --frontend
  --frontend-batch2`: passed including real browser CSV/XLSX statement import with
  the worker path, existing OCR and financial/report/banking flows. No page exceptions.
- `--release-frontend-only`: passed final customer/sales, local plan preview,
  supplier/document pagination and responsive layouts at 320/390/768/1440 widths.
- Existing broader keyboard/validation focus and 320/390/768/1024/1440 layout checks
  passed in the full suite. No full WCAG/penetration-test certification claimed.
- Compose/workflow YAML parsed using existing PyYAML. Docker unavailable and Git
  repository absent; no Docker build/start, Actions execution or deployment claimed.
- No installed dependency version changed; npm audit remains **6 high / 2 moderate**.
  XLSX containment is not remediation of its vulnerable package. Full real database,
  RLS, broker, session/provider, storage/restore and concurrency tests remain pending.

All changed paths and hashes: `docs/milestone-4a-change-inventory.json`.

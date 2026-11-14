# Stage B preparation results — 23 October 2026

**Stage B is not complete. Migration 003 is prepared but has not been executed.**
Financial APIs remain blocked. No real Stage B invoice persistence, scanning,
object-provider or financial browser workflow has been verified.

## Implemented code, not yet enabled

- Exact BigInt VAT engine: explicit standard/reduced/zero/exempt/outside treatment
  and rate, inclusive/exclusive prices, fractional quantities, absolute line
  discounts, mixed rates, signed credit notes, line/group half-up rounding and
  configurable reporting dates. Currency support is GBP/EUR/USD with two minor
  digits; no implicit 20% rate or currency conversion.
- Strict normalized contact/invoice contracts, bounded input, server-generated
  financial facts and parameterized SQL. Supplied ownership/roles/totals are
  rejected. Unknown OCR fields stay in observations rather than invented data.
- Company-scoped contact save/archive/list; invoice draft creation/review saves,
  confirmation, credit lineage, immutable history, attachment links, extraction
  status, bounded pagination/search/direction/status/contact filtering, VAT groups
  and exact input/output totals. New commands reuse Stage A transaction/session,
  authorization, CSRF/origin and rate-limit contracts.
- Transactional idempotency, optimistic versions, audit, account-wide quotas,
  duplicate normalized invoice identities, confirmed immutability and credit
  caps are prepared in services/SQL. Real PostgreSQL behavior is still unverified.
- PDF/Excel export services fetch company-authorized server invoice snapshots
  or confirmed VAT records. No financial rows are accepted from browser exports.
  Excel preserves decimal strings and text values, including formula-like text.
- Private upload/download controller reuses Stage A immutable versioned S3
  storage and quarantine contracts. Its namespace is not mounted or allowlisted.
- Worker-only PostgreSQL lease functions/store plus bounded orchestration:
  private original integrity checks, trusted inspection port, OCR observations,
  confidence/provenance, manual review, capped retries, backoff and stale lease
  rejection. OCR never confirms; a missing inspector cannot claim jobs.

The proposed schema contains 17 tables, 16 FORCE RLS tenant tables, six explicitly
named indexes plus PK/UNIQUE indexes, 55 policies (four affecting existing Stage A
tables), ten functions, ten triggers and one restricted worker role. See the full
[migration review](stage-b-migration-review.md) and
[manifest](../database/migrations/saas/stage-b.manifest.json). No administrator,
financial record, paid entitlement or sample tax rate is seeded by migration SQL.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | **207 passed, 0 failed, 0 skipped** |
| New Stage B subset | **28 passed**; golden, unit, injected transport and offline syntax tests |
| PostgreSQL 17 offline parser | Candidate and SQL-language bodies parsed; not catalog/PLpgSQL execution |
| `npm run saas:build` | Passed; production compilation, TypeScript and 54 generated pages; local single-worker setting |
| `npm run test:browser:saas` | Passed at 1440px and 390px against real isolated PostgreSQL authentication |
| Read-only PostgreSQL target/migration preflight | Matched exact 55440 cluster/installation and Stage A hashes/corrective policies; `business` schema absent |
| `node tests/saas-stage-b-postgres.cjs --preflight` | **Blocked as expected:** no approved/executed 003; zero Stage B scenarios run |
| Actual S3/scanner/OCR service tests | Not run; services not configured |
| Financial browser scenarios | Not run; endpoints and frontend connection remain disabled |

The 207 tests consist of the existing 179 plus 28 new cases. They are not 207
PostgreSQL integration scenarios. The prepared live Stage B runner contains 12
repository scenarios and refuses fixture writes before a matching approved
migration/test selector. It does not replace the larger service/race/restart
acceptance suite listed in the review packet. The earlier 19 Stage A scenarios
are the completed baseline, not newly executed Stage B tests.

The first browser regression failed when acting during a reload. The test now
waits for a new `performance.timeOrigin` and a loaded document before checking
the page; CDP errors include their actual description. The rerun passed both
widths: registration, verification through private encrypted test outbox, incorrect
password, real login, HttpOnly cookie, company context/selection (own 200, other
company 403), refresh, module navigation, own-session panel, logout, password
reset and revoked-session refresh. No actual email or administrator was created.
These are authentication/navigation checks, not proof of PostgreSQL financial UI.
Browser test fixtures created disposable identities/companies on 55440 and an
explicit browser-local empty workspace; they did not create financial records.

## Frontend and remaining implementation

**No financial screen is connected to the new backend yet.** Dashboard, upload,
review, listings, suppliers, customers and VAT reports preserve their existing
UI and browser-local development behavior. They must not be described as real
durable financial workflows. No old browser records have been imported into the
new database or associated by email. No localStorage financial adapter was added
to the new backend. The prepared HTTP controller remains unmounted and proxy
restrictions remain unchanged.

After migration approval: run actual catalog/RLS/transaction/race tests, fix only
separately approved SQL where needed, provision isolated private storage and a
trusted scanner/decoder/OCR host, then connect the existing UI incrementally to
these server commands. Financial API activation remains conditional on passing
actual authorization, persistence and company-isolation tests.

Additional incomplete work includes resource-limited provider hosting, actual
OCR/manual-review acceptance and supplier/customer matching, line-level confidence
UI, partial/incomplete manual draft storage, detailed review-issue resolution,
tax-code/period administration, overlap/finalization/adjustment reporting,
recoverability/accounting policy review, correction/replacement workflows beyond
bounded linked credit notes, broader date/sort filters and bulk export behavior.
The SQL foundations for adjustments/payments/ORS links are deliberately not
writable from the runtime until their commands and tests exist. ORS source IDs
are future references with no insert grant; future migrations must add actual
tenant source foreign keys before those links can be written.

Each new invoice or credit note currently consumes one account-wide UTC calendar
month allowance; retries/review/revisions do not. A real verified entitlement
source and owner review of billing-period/credit-count policy are still needed.
No subscription is activated and no payment or HMRC integration is claimed.

See [development service requirements](stage-b-development-services.md) for
server-only storage values and the missing scanner/host boundary. No new
dependencies were installed. No actual provider/scanner binary was available
on PATH; no service was silently substituted for trusted inspection.

## Safety and delivery inventory

Only the approved local 55440 database was contacted. Its preflight was read-only;
the browser test wrote disposable authentication/company fixtures there. New
migration SQL did not run. Port 55439 was not connected, started or modified in
this Stage B work. No production Firebase, Flutter/mobile system, customer data,
DNS, Vercel deployment or immutable backup operation was performed. This is a
record of this session's operations, not an external infrastructure audit.

The temporary local HTTPS app was stopped after browser checks. The existing
isolated PostgreSQL service remains running. No worker, bucket, scanner or
external service was created. Approved 001 and 002 files remain unchanged.

The exact source/document/test/screenshot inventory is
[master-stage-b-change-inventory.json](master-stage-b-change-inventory.json).
It compares the beginning-of-Stage-B file-hash baseline and excludes credentials,
private evidence/logs, node_modules and generated build output. Existing browser
screenshots were refreshed by the real authentication regression; no frontend
product file was redesigned. Private logs/preflight evidence remain under
`.master-stage-b`; the browser result file is under `.master-stage-a` as before.

## Required approval

Approve only the reviewed backups and
`database/migrations/saas/003_stage_b_invoices.review.sql`, SHA-256
`a881b6bd1278f8bdcd0a0ae74739eb5cdd07defb8883c19f89aea79ecfd5887b`, on
`D:\vetthevat.saas-dev\cluster`, `127.0.0.1:55440/vtv_saas_dev`, including the
documented worker role and four existing-table policies, followed by disposable
integration fixtures in that database. No later migration, production operation,
real administrator, public financial activation or deployment is included.

Your instruction **“Do not execute any new migration without separate explicit
approval”** requires stopping here. **Stage B remains incomplete.**

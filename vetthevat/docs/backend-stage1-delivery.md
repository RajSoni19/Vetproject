# Production backend Stage 1 delivery

22 October 2026. **Safe local implementation delivered; production activation
blocked.** This repository is not a Git checkout, so file hashes captured before
editing were used for the change inventory. No existing browser records were read,
imported, migrated or deleted. A fresh synthetic browser profile was used for tests.

## 1. Exact changes

See `backend-stage1-change-inventory.json` for added/modified source files and
SHA-256 hashes. Generated Next.js output, TypeScript cache, and ignored `.stage1/`
test logs/baseline are build/test artifacts, not application source changes.
New screenshots are in `docs/previews/stage1/`.

| Files | Delivered behavior |
| --- | --- |
| `lib/server/stage1/security.ts` | Firebase Admin structural adapter, revoked-token checks, verified session registry requirement, company membership/capability middleware, session-bound CSRF/origin validation, security audit allowlist, shared Redis atomic rate-limit adapter/script. |
| `lib/server/stage1/repositories.ts` | Company-scoped customer/supplier CRUD through create/read/update/archive, invoice reads/search/filter/pagination, atomic draft/confirmation saves and ordered lines, VAT groups, optimistic versions, idempotency, revision/audit writes, settings and activity. |
| `lib/server/stage1/banking.ts` | Deterministic bank/invoice locks, exact aggregate balance checks, currency/direction/review validation, atomic allocations and audit. Allocated invoice edits fail until allocations are reversed. No reversal endpoint shipped. |
| `lib/server/stage1/documents.ts` | Bounded raw uploads, supported signatures, trusted hashes, required content-inspection port, duplicate fingerprint serialization, document metadata/job creation, status, capped retry and authorized original streaming. |
| `lib/server/stage1/local-storage.ts` | Explicit development-only write-once private filesystem adapter, integrity checks, generated identifiers, ownership/path checks. |
| `lib/server/stage1/extraction.ts`, `pdf-reader.ts`, `local-ocr.ts`, `worker.ts` | Conservative typed extraction, actual digital PDF.js reader and local Tesseract image adapter, scanned-page OCR port, leased job state transitions, one-job orchestration with integrity/deadline checks and generic failures. |
| `lib/server/stage1/http.ts`, `app/api/stage1/[...segments]/route.ts` | Dependency-injected HTTP contracts. Shipped route has no configured dependencies; current proxy also blocks it. |
| `lib/server/stage1/legacy-import.ts` | Explicit validated import preview and source fingerprint; no automatic browser reads or execution. Invalid browser role/plan fields rejected. Financial imports must remain drafts. |
| `lib/server/business-contracts.ts` | Added WEBP to invoice upload intent. Existing financial calculations unchanged. |
| `lib/ors/*`, `components/ors-workspace.tsx`, `app/app/ors/page.tsx`, `lib/workspace-navigation.ts` | ORS contracts, synthetic fixtures, navigation and interactive request/approve/order/partial-receive/inventory/history preview. |
| `database/drafts/stage1/*` | Unapproved additive extraction-job/WEBP/account-aggregate candidate and review instructions. No runtime/worker grants. Existing SQL drafts unchanged. |
| `proxy.ts` | Fixed pre-existing setup-page redirect loop. Static unavailable-auth notices render outside marketing-only mode; workspace/API access stays denied. Marketing-only mode continues returning 404 for these paths. |
| `.gitignore`, `.vercelignore` | Exclude development originals and local verification artifacts. Existing marketing deployment exclusions retained. |
| `tests/stage1-*.test.cjs`, `tests/browser-stage1-boundary.cjs`, `tests/browser-invoices.cjs` | New synthetic tests and isolated browser boundary mode. |

## 2. Working and mocked functionality

**Executed with real local adapters:** TypeScript server code, business validators,
private write-once file storage, actual synthetic PDF text extraction with installed
PDF.js, actual synthetic PNG OCR with installed Tesseract and bundled English data,
and the existing built site's browser/access-denial checks.

**Executed with test doubles:** Firebase Admin SDK calls, session registry,
membership resolution, broker tickets, SQL transport/transactions, audit sink,
content safety inspection and shared-store transport. Quota concurrency uses a
serialized transactional double; 60 simultaneous synthetic requests across two
companies admit exactly Basic's 30 invoices. This does **not** verify PostgreSQL
row locking/RLS or Redis Lua execution. Rollback after a ledger insert and editing
without another quota charge are independently tested.

**ORS:** local React state and synthetic fixtures only. Requests can be approved,
ordered and partially received with over-receiving prevented and inventory/history
updated. Reload clears the preview. Attachments and VAT invoice links have typed
contracts but no working backend. Fixtures do not represent entitlements, actual
approvals or sent supplier orders. Existing top-level ORS mode remains unavailable;
the new navigation entry is a development preview. It is not production-ready and
has no Flutter integration. Its state transitions are unit-tested; signed-in ORS
browser interaction remains unverified behind the authentication gate.

## 3. Database status and remaining schema blockers

No PostgreSQL connection, migration, role change, grant, database reset or SQL
execution occurred. Existing documents contain static review and owner-reported
checks, not independently reproduced server results. **No approved target schema
was supplied.** The DAL targets `database/drafts/milestone-4a/001_atomic_vat.review.sql`
plus the new Stage 1 extension for review and synthetic testing only. It cannot
operate against an approved live database yet.

The existing baseline's atomic creation/forced RLS/NOLOGIN owner/default-ACL
checks are preserved. The DAL binds transaction-local opaque tickets instead of
browser-controlled user/role GUCs and independently checks the binding. Every
business method names its required capability and company predicate. Real broker
issuance and bootstrap remain unconfigured. Owner-only aggregate-helper access
is proposed to count quota across an account without exposing another company's
ledger rows to ordinary runtime SELECT. This SQL has not been PostgreSQL-parsed.

Still required: actual verification outputs, effective owner/role/default ACL
review, independent broker service, least-privilege runtime/write/worker policies,
actor-to-ticket enforcement, account-period provisioning/overlap controls, stale
ticket/pool-reuse tests and two-connection RLS/financial-concurrency tests. All
write-command paths must be approved together, including reads needed during
writes, idempotency, quota, append-only audit/revisions and original ownership.
Direct database writers must follow the same locking/invariant protocol; the
current drafts do not enforce every aggregate invariant against arbitrary SQL.

Review hashes (not permission to execute):

* Existing milestone-4a baseline: `fec9255f06cf4c8329f985e1f078ddad56218586f239a0b179d350a1b75b1b3b`.
* Stage 1 extension: `5ce2aa4044de27fd64405751977c6bb52b105a1184f4a0e510fd0d2416fb9b13`.

## 4. Authentication and quotas

Current deployed strategy remains **unconfigured authentication with private
access denied**. `administratorAuthServices()` still returns undefined; there
are no live password/session/token-exchange endpoints and no SDK initialization
or Firebase project changes. The new adapter requires a supplied, reviewed Admin
Auth instance and calls SDK verification with revocation checks. SDK wiring,
project/issuer/audience review, disabled-user behavior, durable web-only session
registration/revocation, CSRF bootstrap and session establishment need integration
approval. Existing secure session preparation and cookie policy are reused.

Plans remain Basic GBP9/30 invoices/2 companies/2 seats, Starter GBP15/100/2/4,
Growth GBP25/300/3/6; Basic ORS is optional GBP5 and other plans include it as
metadata. No billing-provider activation or capacity provisioning is implemented.
Invoice creation locks the resolved account, verifies its authoritative active
subscription/current period, counts pending+committed usage, and saves ledger,
invoice and audit in one transaction. Manual and uploaded invoices share the save
path; an upload alone is not an invoice creation. Edits do not reserve new usage.
Plan/role/account fields are not accepted from business request bodies. Trial and
proration policies are not introduced by these commands.

## 5. Invoice intake, extraction and originals

The HTTP upload contract accepts raw bytes with Content-Type and X-File-Name,
Idempotency-Key, verified cookie and CSRF headers; maximum 10 MiB. Supported types:
PDF, JPEG, PNG and WEBP. The server calculates SHA-256 rather than trusting a
browser digest. Signatures and PDF end markers are preliminary checks only:
**a clean bounded decode/malware verdict is required before storage**. No real
production inspector is configured. Synthetic signature fixtures prove rejection
behavior, not that header-only files are valid invoices.

Private originals are never public URLs or localStorage-only data. The development
adapter stores immutable bytes outside `public/`, with hash/version checks, but
is not durable Vercel storage and must never be enabled in production. Cloud
private versioning, encryption, lifecycle/backups, access logging and orphan
reconciliation still require a provider adapter and approval. Unknown database
COMMIT outcomes must not cause original deletion; file writes can leave orphans
for later reconciliation. Duplicate fingerprints return an existing document ID;
clients fetch its job status separately.

Extraction preserves missing financial values as null, never supplies a default
20% rate, preserves duplicate lines and explicit exempt/zero/out-of-scope labels,
checks source totals and line-net sums, flags ambiguous suppliers, and always
requires review. The conservative server parser supports labeled fields and an
explicit pipe-separated line layout; it is not a universal invoice parser. The
existing richer browser PDF.js/Tesseract pipeline and VAT arithmetic are preserved.
Original identity links to a durable extraction job; only explicit invoice save
can confirm financial data. A scanned-PDF rasterizer in an OS-isolated worker and
production content decoder/scanner remain unimplemented. Worker queue scheduling
and a trusted worker principal are also not configured. Three total attempts,
lease fencing and generic failure codes are prepared in code and review SQL.

Legacy local import is a preview-only server contract, not a finished transfer
wizard. Explicit source-company/contact/document mapping, original transfer,
provenance persistence and user-approved commit remain future work. No existing
browser data is automatically touched.

## 6. API contracts

Prefix: `/api/stage1/companies/{companyId}`. Injected tests exercise these handlers;
the shipped app continues denying access until approved services are connected.

| Resource | Methods |
| --- | --- |
| `customers`, `suppliers` | GET list, POST create; `/{id}` GET and PUT. Archive via status update. |
| `invoices` | GET list, POST save; `/{id}` GET and PUT. Body action save-draft or confirm. Lines persist atomically. |
| `settings` | GET and PUT company settings. |
| `activity` | GET company activity without sensitive audit payloads. |
| `documents` | GET list, POST original intake. |
| `documents/{id}/status` | GET extraction state/result. |
| `documents/{id}/original` | GET authorized attachment bytes, no public object URL. |
| `documents/{id}/retry` | POST a permitted failed/expired job retry. |

JSON mutations use Idempotency-Key and quoted numeric If-Match; creates use
version 1. Invoice POST is an idempotent save/upsert by UUID, not a guarantee of a
new row. GET lists use bounded limit and UUID cursor. Invoice filters include
query/date/currency/direction/status/supplier/customer. Contacts support name
search and pagination; activity supports event search; documents support pagination.
Other filter capabilities require further implementation. Errors are redacted
and responses are no-store. Upload and extraction status do not consume invoice
quota; persisting the resulting new invoice does.

## 7. Validation

* `npm run typecheck`: passed.
* `npm run build`: passed, including route compilation; no deployment.
* `npm test`: **131 passed, 0 failed**. Includes prior tests and new auth/tenant/API,
  malformed upload, extraction, real local adapters, transactional-double quota,
  banking rejection, idempotency, lease, legacy-preview and ORS tests.
* `node tests/browser-invoices.cjs --stage1-boundary-only`: passed in a fresh
  headless Chrome profile against a loopback production server. Private/ORS
  routes redirect, forged GET/POST/PUT API requests are denied, synthetic browser
  data survives, and public pricing fits 390/1440 widths. Screenshot inspected.
* PostgreSQL-backed and real Redis tests: **not run**. Signed-in end-to-end
  upload/invoice/ORS workflows: **blocked by unconfigured identity**, not passed.
* Real synthetic PDF test emits PDF.js's standard-font-data warning while
  extracting the asserted text successfully; broader font/layout fixtures remain.

The first browser attempt exposed the existing `/login` self-redirect and failed.
The proxy fix was unit-tested, rebuilt and then passed the browser regression.

## 8. Approval boundary

Do not enable production on the strength of mocked tests. Next approval-dependent
work is review of cluster verification results and an exact synthetic **test-only**
migration/grant/broker package with recovery plan and hashes. The candidate above
does not yet contain that complete privilege package and is not ready to execute.
Separately approve Firebase integration/session policy, private storage and
sandboxed inspection/worker services, shared rate store and security audit sink.
Only after real integration tests pass should authentication cutover and a Vercel
deployment be proposed. Existing dependency/security release checks still apply;
this work did not install, update or audit packages.

No changes were made to `D:\vetthevat-backup`, Flutter, production Firebase,
PostgreSQL, Vercel deployments, Cloudflare/GoDaddy DNS, payments or email services.

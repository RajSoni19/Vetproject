# Production-readiness review — Stage 3

Code review and local synthetic verification only. **Not production-ready.**
Verified means supported by current source or an explicitly described local test;
partially verified means implementation inspected but full operation not tested;
unverified means no runtime/service evidence. This is not an exhaustive penetration,
accessibility, tax-compliance or dependency-security assessment. No live database,
API, provider, deployment configuration or production records were accessed.

## Critical

| ID / status | Evidence and impact | Required remediation |
| --- | --- | --- |
| C1 Verified: authentication and authorization absent | app/login/page.tsx `enter` redirects without verification; components/auth-form-page.tsx submits demo forms; app/app/layout.tsx has no session gate; components/app-state.tsx only checks selected company. Direct app routes load without authentication. Local team roles never restrict actions. Any browser user can access/change its workspace. | Verify existing shared backend first; integrate genuine sessions, membership and server role checks for every read/write/export/document action. Do not treat a company header as authority. |
| C2 Verified: PostgreSQL/persistence absent | AppStateProvider `commit` writes localStorage through lib/workspace.ts `persistWorkspace`; demo-data initializes records. No server API route, DB driver/ORM or active database integration was found. Clearing browser storage loses records; profiles/devices do not share them. | All production business data must use PostgreSQL through the verified secured backend. Approve staging infrastructure and integration separately; retain manual entry/extraction architecture. |
| C3 Verified: originals and recoverability absent | lib/workspace.ts `serializeWorkspace` removes localPreviewUrl and textContent; files are blob URLs. Chrome refresh/checksum recovery tests prove the original must be supplied again. Invoice metadata does not back up file bytes. | Private durable storage with authorized retrieval, checksums, retention, versioning and tested recovery; owner-controlled database and file backups. |

## High

| ID / status | Evidence and impact | Required remediation |
| --- | --- | --- |
| H1 Partially verified: schema not migration-ready | database/001_initial_schema.sql: invoice_status lacks Draft; required invoice_date/number conflict with incomplete drafts; numeric limits and local IDs/status spelling require mapping; supplier/document foreign keys do not enforce matching company; null supplier IDs weaken invoice-number uniqueness. | Design reviewed PostgreSQL migrations, nullable draft fields/verification constraints, same-company composite foreign keys, normalized duplicate rules and transactional idempotency. No schema was executed or modified. |
| H2 Partially verified: RLS insufficient alone | Schema policies trust app.current_company_id; do not themselves establish authenticated membership/role. app_users/api_clients lack enabled RLS; owner/bypass roles require review. No database-role or RLS execution evidence. | Least-privilege runtime role, transaction-local trusted context, membership/role checks, cross-tenant read/write tests and explicit policies for sensitive tables. |
| H3 Verified: client-only financial trust | lib/invoice-rules.ts `validateInvoice`, client saveInvoice and lib/reporting.ts use editable browser records. Reports can explicitly include incomplete drafts; restored data receives structural but not full domain validation. Devtools can bypass controls or corrupt fields. | Validate/recalculate on the server; immutable reviewed revisions, concurrency/version checks and tamper-resistant audit events. Deep restoration/import validation before any production data migration. |
| H4 Partially verified: hostile-document/resource coverage incomplete | lib/document-validation.ts checks client MIME/signatures/10 MB; extractor caps 20 pages, canvas 7.5 million pixels and chooser two minutes. Image decode happens before downscaling; compressed malicious PDFs/images and extreme text can still consume resources. Synthetic corrupt/encrypted samples are not adversarial coverage. | Server validation, isolated bounded workers, decoded-dimension/text limits, rate limits and malware policy. Client OCR can remain a convenience, not the security boundary. |

## Medium

| ID / status | Evidence and impact | Required remediation |
| --- | --- | --- |
| M1 Verified: VAT semantics incomplete | lib/domain.ts numeric vatRate does not distinguish zero-rated, exempt or outside-scope; createInvoiceDraft/add-line default 0. Missing extracted VAT requires explicit review, but manual default 0 does not prove intended treatment. Credit notes/negative amounts and inclusive prices are unsupported. | Accountant/owner approves supported tax categories, currency precision, discounts and rounding. Add treatment fields and explicit manual selection when approved; do not claim tax certification. |
| M2 Verified: financial range/rounding limits | lib/money.ts rounds half-up line net before VAT, quantities/prices 4 decimals, discounts/rates 2; invoices reconcile exactly at confirmation. Parser warnings tolerate 2p, not confirmation. Aggregates use Number minor units; extreme combined totals can exceed safe integer precision. Header maximum differs at the SQL boundary. | Approve the policy; backend decimal arithmetic, bounded totals/counts and consistent PostgreSQL numeric ranges. GBP/EUR/USD only, no currency conversion. |
| M3 Verified: lint unavailable | package.json calls removed `next lint`; installed Next ESLint documentation explicitly requires eslint and eslint-config-next. Neither package/config is present. Build does not run ESLint. | Owner approval to add compatible ESLint packages, flat core-web-vitals/TypeScript config and `eslint .` script; then resolve findings. No packages/config were fabricated. |
| M4 Verified: CSP needs future hardening | next.config.ts retains unsafe-inline scripts/styles and blob workers; Stage 3 adds blob connect only for local preview validation. Production excludes general unsafe-eval. External API/storage origins remain blocked. | Review nonce/hash strategy against installed Next docs and deployment rendering, then explicit provider allowlists. Avoid broad wildcard relaxation. |
| M5 Verified: public/account launch gaps | app/contact/page.tsx displays an outline with no delivery mechanism; security/privacy/terms are outlines. Root canonical '/' is inherited by pages without overrides; sitemap misses /product and /benefits and includes account entry routes. Some product/mobile/VAT-check claims lack connected service evidence. Register/reset/verify/onboarding forms do not perform their named external operations; onboarding does not persist a company. | Approve real operator/contact/domain/pricing/legal/mobile facts; complete route metadata and truthful content, then verified contact/auth/onboarding integrations. Existing design preserved. |
| M6 Verified: operational recovery incomplete | Settings `backup` exports selected company records, excludes originals, audit and notifications, and has no import/restore tool. Local audit is editable; no operational monitoring, server logs, retention jobs, scheduled backups or tested DB restore. | Full reviewed export/import format and recovery test; authenticated central audit/observability, retention policy, database plus object recovery drills. |

## Low and assessment limits

- Verified: document viewer now checks availability when the URL changes or viewer
  mounts. Revocation after that check is not monitored continuously. Document list
  availability and workbook metadata still infer availability from URL presence;
  they are not durable-file checks. Source: DocumentsPage/createReportWorkbook.
- Verified: generic record dialogs now contain Tab focus and restore focus on close;
  public mobile navigation has expanded/control semantics. Full screen-reader,
  contrast and keyboard testing across drawers/notifications is unverified.
- Verified: `npm audit --json` returned zero advisories across 219 dependency entries
  in the current configured registry response. This is not evidence that every
  dependency is vulnerability-free. No audit fix or package installation ran.
- Verified by source searches: no application dangerouslySetInnerHTML, server SQL
  execution or application console logging was found in app/components/lib.
  React text interpolation is used. Workbook user strings are string cells, not
  executable formulas; report APIs are still client-only. Stored/tampered data,
  extensions, browser access and permissive inline CSP remain trust risks. No
  exhaustive XSS, SQL injection, formula injection or malicious PDF tests ran.
- Project configuration inspection found .env.example only, not a verified live
  provider setup. Only environment key names were reviewed; no values/secrets were
  printed. lib/api/client.ts `createApiClient` requires NEXT_PUBLIC_API_BASE_URL;
  AndroidBackendApi adapters are unused and their /v1 paths are proposals, not
  confirmed endpoints. No unrelated credential locations were searched.
- Existing .gitignore omits a general .env.* pattern, DB dumps and client upload
  paths. No .git directory exists. Git initialization remains an owner decision.

## Fixed defects with reproductions

| Severity / evidence | Reproduction; expected vs previous actual | Fix / regression evidence |
| --- | --- | --- |
| High, verified | Parse `Subtotal: 50`, `VAT 20%`, `Total: 60`; expect unknown VAT amount, previously extracted 20 | matchDocumentAmount rejects percentage tokens as amounts; parser tests require review |
| Medium, verified | Header search POS-STAGE3, then BROWSER-TEST-123 on mounted list; expect new results, previous effect ran once | InvoiceList subscribes to useSearchParams inside Suspense; Chrome consecutive-search test |
| Medium, verified | Reuse original document ID for another invoice; expect rejection, previous saveInvoice could overwrite associatedInvoiceId | validateInvoiceDocument rejects missing/cross-company/already-linked originals; regression tests |
| Medium, verified | Pass valid D/M/Y reporting boundaries; expect inclusive normalized range, previous lexical comparison could exclude valid rows | filterInvoices/buildReport normalize dates; validation requires ISO stored invoice dates; regression tests |
| Medium, verified | Supply revoked blob URL; expect unavailable controls, previously controls enabled on truthy URL | Viewer verifies blob availability and always offers checksum restoration on document detail; Chrome mismatch/restore/download tests |
| Low, verified | Tab/Shift+Tab at dialog edges; expect containment, previously focus left dialog | RecordFormDialog traps focus, Escape closes, returns to trigger; actual Chrome keyboard test |
| Low, partially verified | Abort during image decode or pass a rejecting promise to already-aborted abortable; expect resources/rejections handled, prior late decode could leak | Late bitmap closed and abandoned promise rejection handled; actual OCR cancellation/retry passed, allocation not profiled |

The preview fix initially failed real-browser testing because connect-src blocked
blob fetches. Narrow blob permission and asynchronous preview waiting fixed the
regression. All final tested upload formats retain actual previews.

## Architecture and exact owner decisions

1. Confirm existing shared backend/Android API ownership, documentation, staging
   base URL, supported auth/session flow and safe test accounts. Current adapters
   must be reconciled with actual contracts; do not guess endpoints.
2. Approve PostgreSQL staging access, least-privilege roles, migration process,
   region, recovery targets and backup ownership. Confirm schema mappings first.
3. Approve auth provider and role matrix; session expiry/revocation, cookie/CSRF
   policy and membership validation need server acceptance tests.
4. Approve private object storage, service identity, authorized download endpoint,
   encryption, retention/versioning and worker hosting. No keys in browser code.
5. Local English Tesseract/PDF.js work without a paid OCR provider. For production
   throughput/accuracy, approve local server workers or a real OCR service,
   languages, representative anonymized supplier samples, processing region,
   credentials, data agreement, usage limits and budget. No service was purchased.
6. Confirm hosting/domain, contact mailbox/API, invitation/email delivery,
   support destination, billing provider/prices and any genuine VAT-validation
   integration. Costs depend on approved providers, storage, page volumes and
   hosting; no current quotation or service access is verified.
7. Supply reference video and approve tooling dependencies. Order Management
   remains outside scope. Stop for review before integrations or deployment.

## Backup, rollback and local Git recommendation

- D:\vetthevat-backup is unchanged: all 90 inventoried source/assets SHA-256
  hashes match the Stage 3 pre-edit baseline (node_modules/.next/.git excluded).
  It is a source recovery snapshot, not evidence of database or original-file backup.
- Before future changes, make a separate dated source snapshot excluding secrets,
  client files and generated artifacts; record hashes. Export/review each existing
  browser workspace without clearing it, retain original files separately, and
  validate recovery in an isolated directory/profile. No real records were read
  or copied into tests during this stage.
- If PostgreSQL already exists, its owner should arrange an authorized consistent
  database backup and separate private-object snapshot, then test restoration to
  an isolated target. No database was discovered/connected or backup command run.
- Roll back reviewed source files from a separate snapshot into a separate working
  copy first, rebuild and verify; do not overwrite the immutable backup or reset
  browser/production data. Changed local records need their own compatible restore
  plan; restoring source alone does not restore data.
- Proposed Git sequence, not executed: extend reviewed ignores for .env.* with
  explicit .env.example allowlist, keys/certificates, dumps and client upload/export
  locations; manually inspect filenames and a staged diff with redaction; initialize
  locally only after approval; stage an explicit source allowlist; inspect again;
  commit only reviewed non-secret source. Add no remote and never `git add .` blindly.

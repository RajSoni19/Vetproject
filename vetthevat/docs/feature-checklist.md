> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Feature development checklist

Scope: Stage 1–3 verification, using the existing local browser workspace. The Stage 3 matrix below supersedes earlier acceptance descriptions.
The reference video is not available in the supplied attachments or repository.
These entries follow the written requirements, not an invented video checklist.
Branding, navigation and existing public pages are preserved.

## Stage 1

| Feature | Implementation / validation |
| --- | --- |
| Manual entry and POS | Shared editor with supplier, dates, currency, quantities, prices, discounts, VAT and notes; POS retains payment selection |
| Draft save/reopen/edit | Browser-local records; save reports failure if localStorage fails |
| Confirmation | Required fields, valid dates, precision, line/header reconciliation and duplicate checks |
| Extraction | PDF embedded text; real English Tesseract OCR for images and scanned PDFs |
| Upload limits | MIME and signature validation, 10 MB, 20 PDF pages, two-minute reading limit |
| Failure/retry | Cancel reading, real extraction retry, corrupt/encrypted-file errors, manual fallback |
| Rapid file selection | Request IDs and AbortController prevent stale results; company changes cancel reading |
| Financial rules | Decimal half-up; four-decimal quantities/unit prices; two-decimal amounts/rates; line net then VAT; absolute line discount; exclusive prices |
| Known parser bugs | Explicit zero VAT retained; identical lines preserved; invalid calendar dates rejected; missing VAT requires review |
| Invoice list | Company, status, date, currency, document/supplier/number search, sorting and pagination |
| Detail/edit | Correct identifier within selected company, no first-invoice fallback, edit/cancel/save and review |
| Original document | Session-only blob preview/download/open/fullscreen; absence after refresh shown honestly |
| Document scope | Original/document routes respect selected company; this is UI scope, not server authorization |
| Local idempotency | Invoice ID upsert; duplicate supplier/number within company blocked on confirmation |
| Cross-tab writes | A change in another tab blocks further saves until reload; no server concurrency guarantee |

Validation commands and actual final results are reported in the Stage 1 summary.
`npm run test` tests real domain/parser/report/workspace code with synthetic inputs,
including actual XLSX serialization and PDF contents. `npm run test:browser` needs installed
Chrome, the already-installed optional canvas package, and a production build;
it uses localhost plus a new temporary profile and synthetic documents.

## Deliberate limitations

- No PostgreSQL connection, real authentication, server authorization or private
  storage has been introduced. Those remain required for production.
- localStorage is not secure, shared, cross-device or an accounting source of truth.
- Originals and OCR text remain session-only. Reloading retains invoice records and
  document metadata but cannot recover the uploaded file bytes.
- Extraction uses English OCR and heuristic field parsing. Customer defaults are
  selected-business values, not independently extracted customer identity.
- Complex supplier layouts can require manual corrections; subtotal-only fallback
  requires source comparison. Invoice confirmation is human review, not tax validation.
- Quotations can still be read and reviewed; saving/conversion remains unavailable,
  and buttons no longer falsely report that a quotation was persisted.
- Inclusive VAT, credit notes and jurisdiction-specific VAT treatment need agreed
  requirements before expansion. Current editor accepts non-negative exclusive lines.
- Existing `npm run lint` still calls removed `next lint`. A real lint configuration
  needs an approved package/tool decision; no replacement dependencies were installed.

## Stage 2 acceptance checklist

| Feature | Final status / evidence |
| --- | --- |
| Record-based dashboard totals/trends | Implemented and tested: shared-summary tests and browser invoice-edit updates |
| Company/date/status/supplier/currency/approval report filters | Implemented and tested: domain tests, invalid-range browser check |
| XLSX/PDF exports match selection and totals | Implemented and tested: serialized artifacts and actual browser downloads; foreign records excluded |
| Company create/view/edit/select and defaults | Implemented and tested in browser, retained after navigation/reload |
| Supplier create/view/edit/search/status filter and company association | Implemented; create/edit/duplicate/default-selection tested in browser, scope validated in domain tests |
| Document filters/metadata/detail/missing IDs | Implemented; scoped/missing IDs tested in browser; individual filter combinations not exhaustively browser-tested |
| Original session preview/download and checksum-matched reattachment | Implemented and tested; bytes remain temporary |
| Team invitation drafts, role/status management | Implemented and tested: no claimed delivery/authentication |
| Settings save/reset/business defaults/local notifications | Implemented and tested; account JSON export implemented but not separately browser-tested |
| Support help/ticket/detail/reply/status | Implemented; ticket/reply/status persistence tested in browser; help links/search not exhaustively tested |
| Subscription descriptions/detail actions | Implemented and tested; purchasing remains blocked by unavailable billing integration |
| Notifications/search/audit | Implemented; preference/read-state tested; all search/audit combinations not exhaustively browser-tested |
| Persistence failures and legacy Stage 1 compatibility | Implemented and tested: injected browser quota failure and domain roundtrip tests |
| Stage 1 invoice/OCR regressions | PASS: full isolated browser suite rerun with Stage 2 |
| Actual invitations, payments, support delivery, auth/PostgreSQL/private storage | BLOCKED: no verified infrastructure/configuration |
| Exact reference-video feature matching | BLOCKED: reference video/screenshots not available |

See docs/stage-2-results.md for Stage 2 files and commands. Stage 3 verification
and the production-readiness review are now recorded in the documents below.

## Subsequent stage

Stage 2 local workflows are implemented; their external integration blockers
remain listed above.

Stage 3: existing public content, contact mechanism, metadata/canonical/sitemap,
accessibility and responsive checks; account/provider interfaces where feasible.

Unverified video-specific screens/interactions remain blocked by the missing video.
No production deployment, paid-service setup, migrations or Order Management work.

## Stage 3 final verification matrix

Verified means local synthetic evidence, not production readiness. Partial means
the stated implementation/evidence is limited; missing means no implementation;
blocked means external input or approval is required. Video parity is unverified.

| Feature / route or module | Status | Evidence / limitation |
| --- | --- | --- |
| Manual /app/invoices/new | Implemented, verified locally | Chrome draft, refresh, edit, confirm; validation/reconciliation |
| POS /app/pos | Implemented, verified locally | Card payment stored; draft/reopen/confirm; fractional price/discount/0% produce net/gross 1.00; no payment gateway |
| Drafts/details /app/invoices/[id] | Implemented, verified locally | Reopen/edit, missing ID, company scope and repeat confirmation; browser records only |
| PDF extraction /app/invoices/upload | Implemented, verified locally | Real embedded text and scanned PDF English OCR; actual identity/date/amount fields asserted |
| JPG/JPEG/PNG extraction | Implemented, verified locally | Actual Tesseract output for synthetic images; broad supplier/language accuracy unverified |
| Upload errors/limits | Implemented, verified locally | Signature/size unit tests; corrupt/encrypted/over-page PDF browser checks; client-only enforcement |
| Stop/retry/manual fallback/latest selection | Implemented, verified locally | Actual OCR cancellation/retry, corrupt fallback and rapid selection; two-minute limit source-verified, exhaustion not forced |
| Extracted field population | Partial, synthetic samples verified | Heuristic document content; customer defaults selected company; complex tables need correction |
| Money/VAT/discounts | Defined numeric policy verified | Half-up line net then VAT, four-decimal quantity/price, two-decimal money/rates; exclusive prices and absolute discounts |
| Zero/missing VAT/identical rows | Numeric behavior verified | Zero-rate POS; identical line tests; percentage-only VAT no longer becomes amount |
| Exempt/outside-scope/inclusive VAT/credit notes | Missing, owner decision | Numeric zero does not distinguish tax category; negatives rejected; accountant policy required |
| Invoice list/search/sort/pagination | Implemented, verified locally | Consecutive mounted-route search; scoped date checks; number sort, 20/20/5 pages for 45 records; status/currency predicates domain-tested |
| Duplicates/idempotency | Implemented, verified locally | Same company/supplier/number checks; repeated confirm/upload; no server concurrency guarantee |
| Original association | Implemented, verified domain tests | Reject missing metadata, another company or already-linked original |
| Dashboard /app/dashboard | Implemented, verified locally | Record edits update screen/report totals; currencies separated; drafts can be included |
| Reports /app/reports; VAT /app/vat | Implemented, shared-domain verified | Company/date/supplier/status/approval/currency filters; normalized boundaries; empty/invalid states; all UI combinations not exhaustive |
| XLSX/PDF exports | Implemented, verified artifacts | Browser downloads parsed: rows/totals/foreign exclusion; 1,000-row workbook roundtrip and multi-page PDF tests |
| Companies /app/companies | Implemented, verified locally | Create/edit/select persisted; duplicate/invalid domain inputs; deletion missing |
| Suppliers /app/suppliers | Implemented, verified selected flows | Create/edit/scoped duplicates/defaults; search/status present, combinations not exhaustive; no external VAT registration check |
| Document list /app/documents | Implemented, partial verification | Scoped metadata and missing ID tested; search/status/URL-presence filters inspected; revoked URL badge may be stale |
| Original preview/recovery/download | Implemented, verified locally | Refresh/expired blob disables actions, checksum mismatch rejected, matching file restores; downloaded bytes match |
| Zoom/rotate/open/fullscreen | Implemented, partially verified | Source handlers inspected; preview/download tested; every native action not independently asserted |
| Durable original storage | Missing, blocked | Original bytes/text session-only; legacy metadata may have no checksum |
| Team /app/team | Local records verified | Invitation draft/role/deactivation persisted; draft cannot claim delivery; roles never authorize actions |
| Settings /app/settings | Local preference journeys verified | Save/reset/notifications/business defaults; JSON company export inspected, no full tested restore |
| Support /app/support | Local ticket journeys verified | Ticket/reply/status persisted; help search not exhaustive; remote delivery/attachments missing |
| Subscription /app/subscription | Local information verified | Details open/close; purchase/billing integration missing |
| Search/notifications/audit | Selected local flows verified | Search and mark-read/preferences; scoped activity editable, not secure audit |
| Admin /app/admin | Partial, source verified | Informational integration boundaries, no authenticated administration |
| Transactions | Missing separate route | No /app/transactions; invoice/POS records are current related workflows |
| Order Management | Out of scope | No implementation/expansion |
| Home/About/Product/Benefits/Features/How it works | Pages render verified | /, /about, /product, /benefits, /features, /how-it-works; product claims need owner review |
| Mobile app/Pricing/FAQ | Pages render verified | /mobile-app, /pricing, /faq; app-store/service/pricing facts unverified externally |
| Public Contact/Support | Partial, render verified | /contact, /support; no verified contact delivery mechanism |
| Security/Privacy/Terms | Partial, render verified | Outlines render; operator/legal/retention approvals missing |
| Login/register/reset/verify/onboarding | Demo only, render verified | No real registration/reset/verification; onboarding does not persist company |
| Responsive/accessibility | Partially verified | 390px invoice editor fits; actual modal Tab/Shift+Tab/Escape/focus; public menu expanded semantics; broad assistive audit unverified |
| Metadata/canonical/sitemap | Partial, source verified | Root canonical inherited; sitemap omits product/benefits; domain/content decisions remain |
| PostgreSQL/backend/API | Missing integration, blocked | Schema draft/unused adapters; no verified instance/endpoints; PostgreSQL required |
| Authentication/authorization/private storage/email/billing/hosting | Missing integration or unverified, blocked | No provider access established; no provisioning/deployment |
| Typecheck/tests/build/browser | Verified pass | 23 automated tests, production build, complete actual Chrome runner |
| Lint | Failed, approval blocked | Removed next lint; compatible packages/config absent |
| Advisory audit | Tool result verified, limited | npm audit --json: zero advisories; not vulnerability-free certification |
| Source backup | Verified unchanged | 90 pre-edit SHA-256 hashes match; not DB/original-file backup |
| Video parity | Unverified, blocked | No accessible media; video-feature-matrix.md |

Exact outcomes/files: stage-3-results.md. Severity/evidence/owner actions:
production-readiness-audit.md. No production-readiness claim follows from a pass.

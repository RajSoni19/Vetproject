# Stage 3 verification results

Completed local verification and safe fixes in the existing application.
**Not production-ready:** PostgreSQL, real authentication/server authorization,
private durable originals and operating integrations remain unconnected/unverified.
Branding/routes preserved. Order Management excluded. No packages installed, Git
initialized, production services connected, migrations run or deployments performed.

Read AGENTS.md, Stage 1/2 reports/checklist, source/config/tests and installed Next
documentation for ESLint, data security, useSearchParams and CSP. Source and backup
were SHA-256 inventoried before edits. No accessible reference video was identified
in the project or explicitly supplied assets; unrelated personal files were not searched.

## Behavior completed and defects fixed

- VAT percentage-only labels remain unknown amounts, with review required.
- Consecutive header searches update the mounted invoice list using searchParams
  inside Next-required Suspense.
- Report date boundaries normalize before comparison; confirmed stored invoice
  dates require ISO format, preventing lexical date misordering.
- Saves reject originals missing metadata, belonging to another company, or already
  linked to another invoice; no silent document association reassignment.
- Revoked/missing blob originals disable actions; document detail offers checksum
  recovery even when a stale URL remains. Blob connect permission supports checks.
- Record dialogs contain keyboard focus, close on Escape and restore trigger focus.
  Public mobile navigation announces expanded state and its controlled menu.
- OCR cancellation cleans late image decoding and abandoned promise rejection.
- Regression coverage expanded for these paths and large export reconciliation.

Exact reproductions, severity, prior expected/actual differences and sources are
in production-readiness-audit.md. No video-specific behavior is claimed.

## Exact files changed

Application/domain/configuration:

- app/app/invoices/page.tsx
- app/app/documents/[id]/page.tsx
- components/app-state.tsx
- components/document-viewer.tsx
- components/record-form-dialog.tsx
- components/public-shell.tsx
- lib/invoice-parsing.ts
- lib/invoice-rules.ts
- lib/invoice-filters.ts
- lib/reporting.ts
- lib/document-extraction.ts
- next.config.ts

Tests:

- tests/invoices.test.cjs
- tests/stage2.test.cjs
- tests/browser-invoices.cjs
- tests/browser-stage3-flows.cjs (new)

Documents:

- docs/stage-3-results.md (new)
- docs/feature-checklist.md (updated)
- docs/video-feature-matrix.md (new)
- docs/production-readiness-audit.md (new)

## Commands and actual outcomes

| Command | Final result |
| --- | --- |
| npm run typecheck | PASS |
| npm run test | PASS: 23 tests after approved test-worker execution; initial sandbox attempt failed spawn EPERM |
| npm run build | PASS: production compilation/typecheck and 41 static page generation entries |
| node tests\browser-invoices.cjs --stage2 --stage3 | PASS: actual installed headless Chrome, localhost production build and isolated synthetic profile; no uncaught page exceptions |
| npm run lint | FAIL: removed next lint interpreted lint as project directory; compatible ESLint tooling/config missing |
| npm audit --json | Tool PASS: zero advisories returned across 219 dependency entries; limited registry evidence, not security certification |
| Source/backup SHA-256 comparison | PASS: all 90 backup source/assets unchanged; no source files removed; no .git directory |

No audit fix/package download/migration/deploy command ran. Synthetic fixtures
contain no real client records. Chrome/server processes are closed by the runner;
synthetic artifacts remain in OS temporary folders. Final complete browser run:
vet-vat-synthetic-RZiTDg under the OS temporary directory.

Interim failures were fixed: blob availability fetching was blocked by CSP, then
the preview assertion needed asynchronous waiting. Dialog return-focus testing
initially used programmatic clicks without trigger focus; the helper now focuses
before click and the dialog captures focus before setting its own. Final rerun passed.

## Actual browser journeys

1. Manual draft, refresh, edit, confirm: one record and reconciled totals.
2. Date filtering, unknown invoice ID, company-scoped details.
3. Actual PDF embedded text, scanned PDF OCR, PNG/JPG/JPEG OCR; supplier/number/date/
   net/VAT/gross and session previews asserted against synthetic source content.
4. Extracted review/confirm/reconfirm retains one ID; no repeated record.
5. Corrupt PDF/manual fallback; encrypted/over-page-limit errors; rapid selection
   keeps newest file; manual editor fits a 390px viewport.
6. Company/supplier create/edit/persist, scoped duplicate supplier block, defaults;
   invoice edit updates dashboard/report totals.
7. Actual filtered XLSX/PDF browser downloads parsed against screen totals, row
   count and foreign-company exclusion; invalid date range disables export.
8. Local team invitation draft/role/deactivation, profile settings/reset/preferences,
   support ticket/reply/status, subscription details and notification mark-read.
9. Injected storage-quota failure retains previous record and reports failure.
10. Missing document ID/checksum restoration; POS draft/reopen/confirm/Card status;
    fractional price, discount and zero VAT; duplicate confirm; consecutive search.
11. Real Tab/Shift+Tab/Escape and dialog trigger-focus restoration.
12. Stop actual OCR, fresh retry, repeated upload blocked on confirm; expired blob
    disables actions; same-name/type/size wrong checksum rejected; matching original
    restores preview and actual downloaded bytes equal fixture.
13. Forty-five synthetic records: invoice-number sort and 20/20/5 pagination.
14. Twenty public/account pages render in Chrome: home/about/product/benefits/features/
    how-it-works/mobile-app/pricing/FAQ/contact/support/security/privacy/terms and
    login/register/forgot-password/reset-password/verify-email/onboarding. Rendering
    does not verify authentication, contact delivery, mobile service or legal claims.

Automated tests additionally cover mixed rates/identical lines, calendar rollover,
leap days, nonfinite/precision/negative rejection, company/filename filters, missing
VAT, association guards, legacy restoration and failed writes. A 1,000-row test
roundtrips actual XLSX, reconciles separate currencies, creates a multi-page PDF
and checks first/last invoice labels. Larger workloads, complete PDF visual layout,
hostile uploads, all filter combinations and representative supplier OCR accuracy
are unverified. The feature matrix labels these limits individually.

## Findings and remaining boundaries

- Critical: no real auth/server authorization, PostgreSQL persistence or durable
  originals/recovery. UI scoping is not tenant security.
- High: schema/RLS/draft/foreign-key mapping needs review; financial trust remains
  client-side; hostile-document/resource controls need a server boundary.
- Medium: tax categories/inclusive VAT/credit notes, aggregate precision, lint
  dependencies, CSP hardening, public/account launch gaps and recovery policies.
- Low: stale document availability metadata and incomplete broad accessibility,
  responsive/security coverage. Detailed evidence is in the audit document.

Invoices/business records, team drafts, support replies, notifications and audit
remain browser-local. Account forms are demo flows. Invitations, payments, contact,
support delivery, live VAT validation and private storage are not connected.
No production/external operation is reported successful.

## Backup and safest next step

D:\vetthevat-backup remains unchanged against the pre-edit 90-file source/assets
SHA-256 inventory, excluding node_modules/.next/.git. No source files were removed,
and no repository or remote created. Source backup does not recover browser records,
database records or original files. Backup/rollback/Git recommendations are in the audit.

Review the four deliverables. Supply reference video and verified shared backend/
staging/provider ownership, then approve concrete PostgreSQL integration/schema and
lint tooling stages. Establish separate source/data/original backups and staging
restore checks before production connections. Stop here for owner review.

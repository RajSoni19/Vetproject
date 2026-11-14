# Stage 2 implementation results

Stage 2 is implemented within the existing browser-local workspace. The original
branding, navigation, public routes and Stage 1 invoice workflows are retained.
No PostgreSQL migration, new dependency, paid service, Git initialization or
deployment was performed. Order Management and Stage 3 are outside this stage.

## Implemented

- Dashboard filters, invoice/status metrics, recent records, pending-review links,
  supplier spending and monthly purchase/VAT trends derive from current records.
- Reports and VAT views share company/date/supplier/currency/status/approval/query
  filtering. Monetary totals use integer minor units and separate currencies.
- Real XLSX and PDF generation uses the same filtered records as the screen.
  Reports can explicitly include drafts; default approval is Reviewed. No mixed
  currency grand total is fabricated. Empty/invalid filters prevent export.
- Companies can be created, viewed, edited and selected. Default-currency changes
  affect new invoices, without rewriting historical invoices.
- Suppliers can be created, viewed, edited, searched and status-filtered within a
  company. Duplicate names/VAT identifiers are rejected without merging records.
  Tax identifiers receive format screening only, not registration verification.
- Team records support validated invitation drafts, role/status edits and local
  deactivation. No email is delivered and no real permissions are granted/revoked.
- Settings support profile, business and local-notification preferences, save/reset,
  and selected-company JSON export. Security/account backend actions are explicitly
  unavailable. Invoice original bytes are excluded from the JSON export.
- Support includes searchable linked help articles, local ticket creation/detail,
  status changes and replies. Nothing is sent externally. Attachment delivery/storage
  remains unavailable rather than displaying an ineffective upload control.
- Subscription descriptions retain existing plan information. Plan-detail actions
  work; prices, entitlement activation, renewals and purchases remain unconfigured.
- Documents expose metadata, filters, linked invoices and current-session preview,
  download/open/fullscreen. Matching source files can restore a temporary preview
  after refresh; new uploads store SHA-256 metadata and reject mismatched files.
  Legacy records without checksums explicitly warn that metadata cannot prove identity.
- Local notification read-state and invoice search controls work. Audit records are
  company-scoped and persisted, and admin readiness copy distinguishes local state.
- Shared workspace writes persist all business collections together. State is
  published only after storage succeeds; quota failures retain form data and existing
  records. Another-tab changes block saves until reload.
- Legacy Stage 1 browser records are retained. Legacy supplier scope is derived
  from linked invoices; unreferenced legacy suppliers/demo member/support/activity
  records retain the first legacy company association. Supplier edits do not silently
  rewrite historical invoice supplier snapshots.

## Validation

| Command/check | Actual result |
| --- | --- |
| `npm run typecheck` (tsc --noEmit --incremental false) | PASS |
| `npm run test` | PASS: 19 tests |
| `npm run build` | PASS: production build and TypeScript |
| `npm run lint` | FAIL: pre-existing removed `next lint` script |
| `node tests\\browser-invoices.cjs --stage2` | PASS: actual isolated Chrome suite |
| Source/backup comparison | PASS: zero backup SHA-256 differences; no files removed |

The test suite covers rounding/parser regressions, report selection/summaries, real
XLSX serialization and PDF text, local state roundtrips, legacy preservation,
company-scoped validation and persistence failure. An initial PDF test cleanup
error was corrected to destroy the loading task; the final suite passed.

Browser tests used a new temporary profile and synthetic documents only. The suite
ran manual draft/save/refresh/edit/confirmation and actual PDF/PNG/JPG/JPEG OCR;
corrupt/encrypted/page-heavy/rapid-selection cases; company/supplier management;
invoice-driven dashboard/report updates; actual XLSX/PDF downloads reconciled with
screen totals and exclusion of foreign company records; invitation draft/role/local
deactivation; settings/reset/notification behavior; persisted local tickets/replies;
billing detail interactions; injected quota failure; and checksum-matched session
preview restoration. No uncaught page exceptions occurred. Browser/server processes
were stopped after tests. Synthetic artifacts remain in the OS temporary directory.

Node test workers initially encountered sandbox EPERM. Tests were rerun with
approved execution outside that sandbox. No package installation was needed.

## Exact files changed
- `app/app/admin/page.tsx` (modified)
- `app/app/audit/page.tsx` (modified)
- `app/app/companies/page.tsx` (modified)
- `app/app/dashboard/page.tsx` (modified)
- `app/app/documents/page.tsx` (modified)
- `app/app/documents/[id]/page.tsx` (modified)
- `app/app/invoices/page.tsx` (modified)
- `app/app/reports/page.tsx` (modified)
- `app/app/settings/page.tsx` (modified)
- `app/app/subscription/page.tsx` (modified)
- `app/app/suppliers/page.tsx` (modified)
- `app/app/support/page.tsx` (modified)
- `app/app/team/page.tsx` (modified)
- `app/app/vat/page.tsx` (modified)
- `components/app-shell.tsx` (modified)
- `components/app-state.tsx` (modified)
- `components/invoice-review-workflow.tsx` (modified)
- `lib/domain.ts` (modified)
- `lib/services.ts` (modified)
- `package.json` (modified)
- `tests/browser-invoices.cjs` (modified)
- `tests/load-source.cjs` (modified)
- `components/document-session-restore.tsx` (new)
- `components/record-form-dialog.tsx` (new)
- `components/reporting-kit.tsx` (new)
- `lib/report-exports.ts` (new)
- `lib/reporting.ts` (new)
- `lib/workspace.ts` (new)
- `tests/browser-stage2-flows.cjs` (new)
- `tests/stage2.test.cjs` (new)
- `docs/feature-checklist.md` (updated)
- `docs/stage-2-results.md` (new)

## Remaining limitations and external dependencies

- Browser-local records are not secure, shared, cross-device or server-authoritative.
  PostgreSQL persistence remains required for production.
- Real authentication, server authorization/company isolation, invitation delivery,
  private durable files, external support delivery and billing remain unconnected.
  UI scoping/local role status is not an authorization boundary.
- Original bytes and OCR text remain session-only. Restoring a preview requires the
  owner to supply the file; unavailable originals are never fabricated.
- Existing demo records are visibly local and remain available; no real client data
  was used as fixtures. Tests do not establish broad OCR accuracy across supplier layouts.
- No reference video/screenshots were available; exact video-specific matching is
  BLOCKED. The checklist follows the identifiable written requirements.
- Lint requires a separate approved tool/dependency configuration decision.
- Stage 3 public-site/account work and the comprehensive production audit are not started.

Stage 2 is complete for the feasible local workflows. Integration-dependent features
remain explicitly blocked. Stop here for the results review.


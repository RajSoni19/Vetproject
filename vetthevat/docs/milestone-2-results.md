# Milestone 2 — VAT frontend journeys

Completed locally on 15 October 2026 within the existing browser-local architecture. This completes the requested frontend milestone; it does not make the VAT application production-ready. ORS development has not started.

## Milestone 1 verification

Read `milestone-1-results.md`, its change inventory, the source, existing tests, AGENTS.md and the installed Next.js navigation documentation. The pre-change 24-test suite and full Chrome Stage 1–3/Milestone 1 suite passed: navigation, editing, drafts, actual PDF/image OCR, repeated confirmation, document recovery and single-invoice Excel scope were verified. No confirmed Milestone 1 functional regression required repair.

## Implemented journeys

| Area | Routes and behaviour |
| --- | --- |
| Suppliers | `/app/suppliers`: search, status filters and name/status sorting, duplicate validation and supplier identity review queue. New `/app/suppliers/[id]`: profile, edit/status management, company-scoped invoice history and supplier document folder. Historical invoice snapshots are preserved. Missing/uncertain links require user review; no supplier merge is invented. |
| Companies | `/app/companies` and new `/app/companies/[id]`: business information, VAT identifier, currency and optional reporting period dates; company switching; scoped invoice history and links to supplier/document/member/report workspaces. Archiving requires the exact company name and preserves records; restoration is available. Local member management reuses the existing working team interface. No authentication or access grants are implied. |
| Documents | `/app/documents`: company-scoped library, supplier folder tabs, unassigned inbox, filename/supplier search, review/type/availability filters and upload/name sorting. Blob URLs are checked before originals are labelled session-available. `/app/documents/[id]`: original preview/download, existing checksum recovery and new association form. Cross-company associations, conflicting originals and mismatched suppliers are rejected. Attaching a new original requires invoice review again and is blocked while that invoice is bank-reconciled. Folder assignment is not document verification. |
| VAT reporting | `/app/vat`: company/period/supplier/currency/status/approval/rate selection; exclusive net, VAT and inclusive gross totals kept separate by currency; selected-row XLSX/PDF downloads. Invoice editing now permits optional explicit Purchase/Sale and line Taxable/Zero-rated/Exempt/Out-of-scope metadata. Legacy/OCR records remain unclassified. Zero-VAT categories cannot be confirmed alongside nonzero VAT. Input/output presentation uses recorded transaction types only; input recoverability and HMRC box values are not determined. |
| Invoice reports | `/app/reports`: rate selection chooses invoices containing that rate and retains their complete lines/totals; controls explain this scope. VAT overview exports only the selected VAT rows instead. Export failures are alerts, and line-item workbooks include user-recorded tax metadata. Existing supplier/date/company/currency/status filters and XLSX/PDF exports remain. |
| Banking | New `/app/banking`: company-scoped account labels/currencies and reversible account archiving, local CSV/XLSX upload, worksheet/column mapping, signed or debit/credit amounts, mapped preview and all-or-nothing validation. Imported records survive refresh locally. Search, date/status filters and unmatched queue; amount/reference suggestions require review. Manual partial allocations, payments spread over transactions and a transaction split across invoices are supported. Whole-penny balances, invoice review, currency and company boundaries are checked. Full allocation plus explicit confirmation is required to reconcile. Reversal releases allocations and retains their historical snapshot. Invoice totals and payment statuses are not modified by matching. |

Settings company-record downloads now include the selected company's bank records. No actual customer data was exported during development.

## Financial and preservation boundaries

- `lib/money.ts`, `lib/vat-calculations.ts`, `lib/invoice-rules.ts`, invoice parsing, OCR extraction and service implementations are hash-checked unchanged against the recovery snapshot. Existing rounding/VAT arithmetic was not replaced.
- New classification checks validate explicitly chosen metadata; they do not infer tax treatment, registration, recoverability or a submitted return.
- Existing local records upgrade additively: bank arrays default empty; tax metadata and VAT period preferences are optional. No reseeding/reset of existing records occurs. Original preview bytes remain session-only.
- A reconciled invoice must be reversed before editing or attaching a new original. Existing allocations also block reductions below allocated gross balances and currency changes. No silent financial rewrite is performed.
- Statements use reviewed date/reference/amount/occurrence fingerprints, not bank-issued unique IDs. Identical rows in one statement remain distinct. Overlaps are shown before import and require explicit consent to skip; ambiguous genuinely new overlapping payments still require source review.
- Supported statement conventions are explicit UK decimal amounts, GBP/EUR/USD account currencies and supported calendar dates. Comma-decimal ambiguity, malformed/over-precise amounts, invalid dates, conflicting columns and rows with both debit and credit are rejected. Limits: 5 MB and 5,000 transaction rows per import.

## Verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; new banking route and dynamic supplier/company profiles included |
| `npm run test` | 32 tests passed, including eight new Milestone 2 domain/export/persistence regressions |
| `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2` | Passed; existing and new workflows, no uncaught page exceptions |
| `node tests/browser-invoices.cjs --milestone2` | Passed focused verification including split allocation, protected original attachment, folder assignment and reversal snapshots |

Chrome runs used a separate temporary profile, loopback production preview and synthetic files only. Actual digital PDF extraction, scanned PDF/JPG/JPEG/PNG OCR and existing recovery/duplicate flows passed again. Downloaded VAT XLSX content was checked for actual row scope, classification and VAT values. New pages fit 320, 390, 768 and 1440px viewports without page overflow. Milestone 1 keyboard/modal/navigation checks also passed. Screenshots were visually inspected. These checks are not a WCAG certification or a full cross-browser/security audit.

The existing lint setup remains unavailable (`next lint` is unsupported). No packages or configuration were installed to mask that gap. Final parser hardening and export-error reset were validated by unit/type/build checks after the browser runs.

## Files and local previews

The exact created/modified file inventory is `milestone-2-change-inventory.json`. Main changes are the supplier/company/document/VAT/report routes; `components/app-state.tsx`, invoice editor, report controls and settings backup; new entity-history/association/banking components; and pure banking/VAT/report/association helpers. Seven new synthetic screenshots are under `docs/previews/milestone-2/`. Milestone 1 screenshots were refreshed by its regression suite.

Run `npm run dev` and open:

- `http://localhost:3000/app/suppliers`
- `http://localhost:3000/app/companies`
- `http://localhost:3000/app/documents`
- `http://localhost:3000/app/vat`
- `http://localhost:3000/app/reports`
- `http://localhost:3000/app/banking`

Do not clear an existing browser profile's local storage to preview these screens.

## Recovery and remaining work

Before editing, project sources/tests/docs were copied to `.recovery/milestone-2-20261015-060511/`; package/config originals were also preserved. No Git repository was initialised. Compare and restore individual files from this snapshot after protecting any subsequent changes. Before rolling back to an older app version, the owner should privately preserve records from each browser/company, including new bank/tax metadata; original file bytes need a separate owner-held copy. Do not reset localStorage or overwrite the immutable backup.

All 90 inspected files in `D:\vetthevat-backup` retain their previously recorded hashes. Package manifests are unchanged. No PostgreSQL databases/roles/schema, production Firebase, environment credentials, remote services, deployment or DNS were accessed or modified.

Production completion still requires approved PostgreSQL/service integration, authentication, server authorization and tenant isolation, durable private storage, transactional/idempotent imports and allocation concurrency protection, database/audit backups and restore testing. The reviewed database migration strategy must explicitly map the new bank entities, archive status, optional VAT period and manual tax metadata; no schema was applied here. Secure bank feeds, invitations, billing, support delivery and HMRC filing remain unavailable. Currency conversion, bank fees/write-offs, credit-note netting and ambiguous bank-overlap resolution are not silently simulated.

Next work should remain VAT backend/security/storage readiness and integration after owner approval. ORS must wait until VAT is finished. No further milestone has been started.

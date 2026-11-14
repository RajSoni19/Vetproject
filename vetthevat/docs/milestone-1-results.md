# Milestone 1 — shared workspace and VAT invoice workbench

Implemented locally on 15 October 2026. This is a frontend milestone; the application remains a browser-local demo, not a production invoicing service.

## Completed screens and interactions

- Shared shell across existing application routes: grouped sidebar, breadcrumbs, company context, local-data badge, mobile drawer and bottom navigation. Longest route matching gives one active entry per navigation landmark.
- VAT/ORS presentation uses semantic green/orange tokens. ORS opens an honest unavailable explanation and does not change permissions or connect services. Software Admin is absent from navigation; this is not server authorization. The existing informational admin route has not been converted into a privileged backend.
- Reusable buttons, fields, feedback states, accessible dialog and financial table. Tables support column sorting, twenty-row pagination and mobile record cards. Dialogs contain keyboard focus, close on Escape and restore trigger focus.
- Dashboard: actual current-company invoice counts, currency-separated purchase/VAT totals, purchase activity, review queue, recent invoices, supplier spending and local activity. Demo seeds are explicitly disclosed.
- Invoice register: search, status views, company/date/currency filters, sorting, pagination, empty/error/loading states and filtered reviewed-invoice export.
- Invoice entry/editing: responsive line-item fieldsets, retained drafts and confirmation rules, field errors, focused validation summary, source comparisons and clear browser-only save feedback. Existing manual/POS routes reuse the improved editor.
- Upload/review: keyboard-visible file control, progress semantics, retained OCR stop/retry/manual fallback, mobile source/review tabs and desktop side-by-side workbench. Removed quotation buttons that could not save anything. Temporary quotation review remains clearly excluded from VAT records.
- Original viewer: removed unreachable fabricated sample previews, made controls wrap, and linked missing originals to the existing checksum-based restoration workflow.
- Invoice detail Excel export now supplies only the displayed invoice, including an explicitly selected draft when requested; it no longer exports the entire company. Export failures show feedback.
- Unsaved changes are guarded for invoice forms, pending uploads, record dialogs, settings and support forms. Navigation links, workspace search, company changes, cancellation, browser history and page unload are handled. Native unload dialogs depend on browser interaction policy. Settings tabs ask before discarding changes.

## Files modified

| Area | Files |
| --- | --- |
| Shell/theme | `.gitignore`, `tailwind.config.ts`, `app/globals.css`, `app/app/layout.tsx`, `components/app-shell.tsx`, `components/app-state.tsx` |
| Dashboard/list | `app/app/dashboard/page.tsx`, `app/app/invoices/page.tsx`, `components/reporting-kit.tsx`, `components/workspace-kit.tsx` |
| Editor/source | `app/app/invoices/upload/page.tsx`, `app/app/invoices/[id]/page.tsx`, `components/invoice-editor.tsx`, `components/invoice-review-workflow.tsx`, `components/document-viewer.tsx` |
| Shared forms | `components/ui/button.tsx`, `components/record-form-dialog.tsx`, `app/app/settings/page.tsx`, `app/app/support/page.tsx` |
| Existing browser tests | `tests/browser-invoices.cjs`, `tests/browser-stage3-flows.cjs` |

New modules: `lib/workspace-navigation.ts`, `components/navigation-guard.tsx`, `components/invoice-workbench.tsx`, `components/ui/dialog.tsx`, `components/ui/feedback.tsx`, `components/ui/field.tsx`, `components/ui/financial-table.tsx`, `tests/milestone1.test.cjs`, `tests/browser-milestone1-flows.cjs`.

Delivery artifacts: this report, `docs/milestone-1-change-inventory.json` and six synthetic screenshots in `docs/previews/milestone-1/`.

## Verification

| Command/check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; 41 pages generated, existing dynamic routes retained |
| `npm run test` | 24 tests passed |
| `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1` | Passed; no uncaught page exceptions |
| `node tests/browser-invoices.cjs --milestone1-only` | Passed after final target-size/tab-panel improvements; regenerated screenshots |
| `npm run lint` | Failed: existing script invokes removed `next lint`; no usable ESLint setup is installed |

Browser tests use installed Chrome, a temporary isolated profile, loopback preview and synthetic fixtures only. They verify actual digital PDF extraction, scanned PDF/PNG/JPG/JPEG OCR, corrupt/encrypted/over-limit recovery, cancellation/retry, latest-upload protection, drafts/editing, repeat confirmation, VAT/zero-rate/fractional-price regression cases, company scoping, persistence failure, reports, downloaded XLSX/PDF contents and original-file checksums. Existing company/supplier/team/settings/support/POS/public flows passed.

New checks verify one active nav entry, absent admin navigation, honest ORS messaging, dirty link/company/cancel/back protection, one-row invoice-detail workbook, sorting and pagination. Dashboard, register, manual editor and upload screen fit 320, 390, 768, 1024 and 1440px widths without page overflow. Mobile drawer focus containment/restoration, workbench arrow-key tabs, validation focus and mobile mode target size passed. Visible focus styling, semantic labels and modal/tab associations are provided. This is not a formal WCAG certification; manual screen-reader, browser zoom and cross-browser review remain outstanding.

The production build and test workers required permission to spawn local subprocesses in this environment. No packages were installed.

## Preservation and recovery

No Git repository was present. Before editing, 103 original project files were preserved at `.recovery/milestone-1-2026-10-15T00-11-52-282Z/`, with an inventory. `.recovery/` is ignored. No environment secrets or browser client records were added to that snapshot. To undo an individual change, compare and restore that file from this recovery snapshot after preserving any subsequent work; remove newly introduced modules only after confirming they have no later changes. Do not overwrite the whole project or the immutable backup.

All 90 inspected backup files retained their original hashes. Financial arithmetic, invoice validation/parsing/duplicate rules, OCR engine, service logic and workspace serialization were hash-checked unchanged. No databases, roles, environment configuration, production services or deployments were changed. Existing browser-local records were not reset; tests touched only their isolated synthetic profile.

## Remaining limitations and approval decisions

- Browser localStorage is not secure, shared or durable production storage. Original file bytes remain session-only; checksum restoration requires the original file again.
- Authentication, server authorization, tenant isolation, PostgreSQL integration, private storage and real ORS access are still unavailable. A company selector is not a security boundary.
- OCR parsing remains heuristic; human correction and reconciliation are required. Existing financial rules have not changed.
- Invitations, notifications, support and billing retain their existing explicitly local/unavailable boundaries. No fabricated delivery or payment success was introduced.
- Adding/configuring a supported linter requires approval for the missing tooling. No installation was attempted.
- Wider ORS, bank reconciliation, backend migration and deployment remain outside this milestone.

## Local preview

Run `npm run dev`, then open `http://localhost:3000/app/dashboard`, `/app/invoices`, `/app/invoices/new` or `/app/invoices/upload`. This uses that browser profile's local records; do not clear its storage. For isolated regression verification, first build, then use the browser-test commands above. Screenshot files contain synthetic/demo data, not customer records.

Milestone 1 is complete. Await owner review before the next milestone.

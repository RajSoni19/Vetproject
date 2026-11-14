# VAT frontend audit refresh and second batch — 20 October 2026

This continues the existing application and the 16 October frontend batch. It does
not restart the project. PostgreSQL security verification remains paused. Git is
still absent; originals were copied to `.recovery/frontend-20261020-200620` before
editing. The immutable backup was not modified.

## Existing routes, components and current status

The complete prior route map is in `frontend-phase-audit.md` and the routes/component
inventory in `frontend-phase-change-inventory.json`. This inspection confirmed
those routes still exist; no route was added or removed in this batch.

| Module / routes | Implemented local frontend / preserved components | Remaining gaps |
| --- | --- | --- |
| Dashboard `/app/dashboard`, `/app` | Filtered reviewed sales/purchase/unknown-direction VAT summaries, currency separation, statistics, charts, review queue and activity. `dashboard-position`, `reporting-kit`, shared shell. | A recorded VAT difference is not submitted/payable/recoverable tax. |
| Invoices `/app/invoices`, `/new`, `/upload`, `/[id]` | Manual entry, draft/reopen/edit/confirm, real PDF/image OCR review, line classifications, source comparison/recovery and exports. Existing workbench/editor/extraction modules preserved. | Purchase-centric headings and search; dedicated sales/customer journeys still needed. Original bytes remain session-only. |
| Suppliers `/app/suppliers`, `/[id]` | Local directory, profiles, contact editing, search/status/sort, history and supplier folders. | No customer directory/contact CRUD; long supplier lists need pagination. Invoice names must not be treated as verified customer identities. |
| Documents `/app/documents`, `/[id]` | Inbox/folders, preview/download, missing-original indicators, checksum reattachment and invoice association. | No durable storage; folder/list scalability and standalone banking-original library remain. |
| Banking `/app/banking` | CSV/XLSX mapping/import, accounts, transaction filters, suggestions, partial/split allocations, review/reconcile/reversal. Existing banking components and penny arithmetic preserved. | Live feeds, fees/write-offs and transactional backend concurrency protection unavailable. |
| VAT/reports `/app/vat`, `/app/reports` | Existing filtered summaries, explicit direction/classification, invoice drill-through and real PDF/XLSX exports. Reports now uses FinancialTable with sorting, pagination and mobile cards. | Export jobs and durable originals are unavailable; no HMRC return/recoverability claim. |
| Companies/team `/app/companies`, `/[id]`, `/app/team` | Profiles/VAT periods/switching/archive; searchable responsive local member/invitation-draft records. | Authentication, permission enforcement and invitation delivery not connected. |
| Settings `/app/settings` | Existing guarded local profile/business/notifications/save/reset/download forms preserved. New integration descriptions and session/security unavailable states. | Provider-backed security/session operations remain unavailable and disabled. |
| Activity `/app/audit` | Previously an unfiltered 840px table; now company-scoped search/action/calendar-date filtering, sorting, pagination, empty/error states and mobile cards. | Browser activity is editable and not a secure server audit trail. |
| Other workspace `/app/support`, `/subscription`, `/pos`, `/admin` | Existing local support, informational plans and POS preserved; admin absent from navigation. | No support/billing delivery. Direct demo admin copy still needs revision; hidden navigation is not authorization. No ORS developed. |
| Public/account routes | Existing home/about/product/benefits/features/how-it-works/mobile-app/pricing/FAQ/contact/support/security/privacy/terms and login/register/reset/verification/onboarding presentation preserved. | External authentication/contact delivery and owner review of legal/marketing claims remain separate work. |

## Confirmed UX/accessibility gaps and this batch's changes

- Settings had no integration overview and only a security paragraph. New capability
  cards explicitly distinguish browser-local functionality from unavailable services;
  they do not probe providers or display invented connection status. Sessions/devices,
  password, MFA and revocation explain their missing dependencies. No fake login
  times/device list/session count or successful security action is generated.
- Settings section selection was visual only. Buttons now expose `aria-pressed`
  within a labelled group, retaining native keyboard behaviour and unsaved changes
  protection. Section buttons wrap on narrow screens instead of hiding the selected section in a horizontal strip. Existing form labels, save/reset actions and local semantics remain.
- Activity and Reports required wide-table scrolling on mobile. Both now reuse the
  existing financial table's mobile cards, sort controls, announced pagination and
  focus styles. Activity also gains labelled filters, invalid-range feedback and
  recoverable empty state. Long details wrap; no activity is deleted by filtering.
- Activity filters use recorded date prefixes for ISO/legacy timestamp formats;
  unknown/invalid dates remain visible without a date range and are excluded when
  filtering by date. No timezone conversion or silent rollover is introduced.
- Report pagination affects presentation only. Export receives the original full
  filtered collection; the interface explicitly says exports include every matching
  invoice across pages. Existing PDF/XLSX generation and totals are unchanged.
- No new broken navigation target was established from source inspection. Unavailable
  integration/security actions are deliberately disabled with explanations. Real
  backend access is not implied by local interaction success.

Source inspection and targeted browser checks are not a full WCAG certification,
screen-reader review or proof every public/account route is complete.

## Prioritized next frontend work

1. Add explicit sales/customer directory/profile/contact journeys with reviewed
   additive local domain/persistence upgrades. Never infer customer identity from
   purchase invoice snapshots or reseed/discard local records.
2. Paginate supplier/document folders, improve invoice direction filters and
   customer/supplier terminology, and standardize remaining long lists.
3. Replace stale demo admin/readiness copy and refine public/account claims; improve
   route loading/error boundaries and complete keyboard/contrast/screen-reader QA.
4. Backend/authentication/private-storage integration remains a separate approved
   phase. Frontend polish does not make localStorage secure/shared/durable.

## Files and verification

Changed application files: `app/app/settings/page.tsx`, `app/app/audit/page.tsx`,
`app/app/reports/page.tsx`; new `components/settings-availability.tsx` and
`lib/activity-filters.ts`. Tests: new `activity-filters.test.cjs` and
`browser-frontend-batch2.cjs`; existing browser runner gains opt-in batch2 flags.
Full inventory and hashes: `frontend-batch2-change-inventory.json`.

- `npm test`: **57 passed**, including three new date/search/company-scope cases.
- `npm run typecheck`: passed.
- `npm run build`: passed; original route map preserved.
- `npm run lint`: existing `next lint` remains unsupported; no pass claimed and no
  dependency installed.
- Full browser suite passed: `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2 --frontend --frontend-batch2`, with no uncaught page exceptions. Real PDF/JPG/JPEG/PNG extraction and existing invoice/export/company/team/banking workflows passed.
- After the final mobile Settings wrapping adjustment, production build, TypeScript and `node tests/browser-invoices.cjs --frontend-batch2-only` passed again. New checks verify all Settings section buttons fit at 320/390/768/1440px, activity search/date errors/company exclusion/pagination, unsaved Settings protection, disabled security actions, and a 21-row XLSX export while viewing report page 2.
- Final mobile screenshots were visually inspected. The first screenshot exposed clipped Settings buttons; the wrapping layout resolved it. A quote-escaping error in the added bounds test was caught by `node --check` and corrected before its successful run. No failed check is counted as passing.

No financial calculation/classification, OCR, persistence, authentication/backend
configuration, database verification or migration file was changed. No database
connection, Firebase/Flutter modification, deployment, ORS work or package install.
Browser tests use isolated synthetic profiles, never the owner's local records.

Preview: run `npm run dev`, then open `/app/settings`, `/app/audit`, `/app/reports`.
Do not clear existing browser storage. New screenshots are under
`docs/previews/frontend-batch2/`. The entire VAT software is not yet complete or
production-ready.

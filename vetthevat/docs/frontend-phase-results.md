# VAT frontend phase — first implementation batch

16 October 2026. PostgreSQL verification remains paused. No PostgreSQL connection,
migration, Firebase/Flutter change, ORS work, package installation or deployment.
The immutable backup was not modified. This is a local frontend improvement,
not completion of the entire VAT product or a production-readiness claim.

## Audit and scope

The route-by-route source findings, completed local workflows, missing customer
journeys, responsiveness/accessibility issues and prioritized plan are in
`docs/frontend-phase-audit.md`. Most Milestone 1/2 workflows already exist; they
were preserved. First priority was misleading dashboard direction labels, missing
mobile sorting and the desktop-only team journey. Screenshot review additionally
confirmed company/header controls crowding at 320px, masked by page overflow rules.

## Implemented

- Dashboard now separates explicitly recorded purchases, sales and unknown
  direction by currency, using existing approved aggregation/rounding helpers.
  Reviewed/confirmed non-draft records feed the recorded position. Missing direction
  stays unknown and is disclosed; drafts/unconfirmed records are excluded visibly.
- Input/output VAT and gross purchase/sale cards reflect those actual records.
  Their recorded difference is explicitly not tax payable, recoverable VAT or a
  submitted return. No recovery percentage, filing status or financial record is
  invented. Existing all-selected-invoice totals remain available separately.
- Dashboard filters now appear above the figures. Mixed records/charts no longer
  claim to be purchase-only. Supplier snapshot references are labelled as such;
  a customer identity is not inferred from an invoice name.
- Shared FinancialTable now exposes sorting and direction controls on mobile,
  shares its sort state with desktop, announces page/result/sort status and uses
  44px pagination controls. Existing table sorting/pagination and row renderers stay.
- Team now has name/email/role search, status filtering, sortable paginated desktop
  records and mobile cards. Existing edit dialogs, local roles and invitation drafts
  are retained; no real account access is granted, revoked or invitation delivered.
- Company header sizing lets its select shrink while retaining visible mode and
  local-data controls at narrow widths. No branding or route was replaced.
- Browser runner now tolerates Windows' transient Chrome debug-endpoint file lock
  and validates that its endpoint is readable before using it. Timeout errors now retain their call-site stack for diagnosis. Native keyboard
  regression uses a complete Enter key event.

## Files

Application changes: `app/app/dashboard/page.tsx`, `app/app/team/page.tsx`,
`app/globals.css`, `components/dashboard-position.tsx` (new),
`components/reporting-kit.tsx`, `components/ui/financial-table.tsx`,
`lib/dashboard-overview.ts` (new).

Tests: `tests/frontend-phase.test.cjs` (new),
`tests/browser-frontend-phase.cjs` (new), `tests/browser-invoices.cjs`.
Audit/results/inventory documents and synthetic screenshots are included in the
change inventory. No existing routes were added, removed or renamed.

Git remains absent. Recoverable originals: `.recovery/frontend-20261016-141225`.
Existing financial/domain/OCR/persistence/service/editor files and both package
files were hash-checked unchanged against that snapshot. Real browser-local data
was not opened, reset or exported; browser tests used fresh synthetic profiles.

## Verification

| Check | Actual result |
| --- | --- |
| Baseline `npm test` | 51 passed |
| Final `npm test` | 54 passed, 0 failed; new cases cover direction/currency separation, unknowns/drafts, real report scope and penny accuracy |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, existing route map preserved |
| `node tests/browser-invoices.cjs --frontend-only` | Passed direction/currency figures, date/currency filters, mobile keyboard sort, team pagination/search/edit and empty recovery; initial harness lock/key-event failures were corrected |
| Full existing browser regression plus `--frontend` | Passed on the final build; all existing stages plus the new frontend checks completed without uncaught page exceptions |
| `npm run lint` | Failed: existing Next 16 project has unsupported `next lint`; no ESLint dependency installed, no lint pass claimed |

Responsive tests exercise 320/390/768/1440px for Dashboard and Team and directly
check header-control bounds, not merely document scroll width. Existing broader
regressions include tablet/desktop navigation, keyboard/dialog/unsaved guards,
OCR, invoices, exports and banking. No full screen-reader/cross-browser WCAG audit
or certification is claimed.

Final browser result: passed (`node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2 --frontend`). An earlier full run hit a CDP timeout after OCR; the diagnostic rerun completed successfully. No failed run is counted as a pass. Final 320px header bounds checks passed, and the generated mobile screenshots were visually inspected.

## Preview and remaining work

Use `npm run dev` and visit `/app/dashboard` and `/app/team` at the local URL printed
by Next. Keep your existing browser data; use a separate profile for synthetic
exploration. Screenshots live in `docs/previews/frontend-phase/`.

Next frontend priorities: explicit sales/customer directory and detail workflows;
standardize report/activity tables and supplier/document pagination; integration
and security/session status screens; review direct admin/account/public copy;
then deeper validation/empty/loading/accessibility coverage. The audit describes
which existing journeys work locally and which external actions remain unavailable.

All persistence is still browser-local. Authentication, shared authorization,
durable originals, bank feeds, invitation/support delivery and billing are not
connected. Customer CRUD and the remaining planned screens are not claimed complete.

# VAT frontend audit — 16 October 2026

Source audit before this phase's edits. Previous milestone results are evidence of
earlier tests, not a substitute for current verification. Baseline: 51 unit tests
passed. Git is absent; originals are preserved in
`.recovery/frontend-20261016-141225`. No database/provider connection is involved.

## Route and component inventory

| Routes | Existing frontend behaviour / status | Gaps and priority |
| --- | --- | --- |
| `/app`, `/app/dashboard` | Workspace redirect; dashboard with filtered invoice counts, review queue, currency metrics, monthly bars and activity. `app-shell`, `reporting-kit`, `FinancialTable` shared. | **P1:** mixed/unclassified/sales records labelled purchases. Missing explicit reviewed sales/purchase and input/output comparison. Filters hidden in details. |
| `/app/invoices`, `/new`, `/upload`, `/[id]` | Search/status/company/date/currency/sort, reviewed export, manual entry, ordered editable lines, drafts/reopen/verification, source comparison and single-invoice XLSX/PDF. `invoice-editor`, `invoice-review-workflow`, `invoice-workbench`, document viewer/recovery. Real PDF.js/Tesseract extraction. | Purchase-oriented headings/search even though manual Purchase/Sale metadata exists. Dedicated sales direction filters/customer workflow absent. OCR remains review-dependent; originals session-only. Preserve arithmetic, classifications, retries, stale-selection protection and duplicates. |
| `/app/suppliers`, `/[id]` | Company-scoped directory, search/status/sort/edit, duplicate warnings, profile/history/folders and identity review queue. | Card lists unpaginated; contact text can be lengthy. No independent customer entity/directory/profile or customer contact CRUD. Do not turn sales snapshots into verified customer identities. |
| `/app/documents`, `/[id]` | Search/status/type/availability filters, supplier folders, unassigned inbox, previews/download, checksum reattachment and invoice association. | No durable object storage, separate general-purpose upload or banking-original library. Long folder bars scroll; no pagination. Missing bytes honestly identified. |
| `/app/banking` | Account labels/currencies/archive, CSV/XLSX mapping/import, transactions/search/date/status, suggestions, reviewed partial/split matches, reconcile/reverse and local history. `bank-import`, `bank-matching`. | No bank feeds, currency conversion, fees/write-offs or durable statements; workflows require review. Preserve exact penny allocations and protection of matched invoices. |
| `/app/vat` | Company/date/supplier/currency/rate/status/approval breakdown, explicit direction/classification, scoped XLSX/PDF. | No submitted HMRC return or recoverability determination. Unknown classes remain unknown. Future period summaries should distinguish recorded VAT difference from actual tax payable. |
| `/app/reports` | Filtered reports, currency totals, monthly/status/supplier presentations and real XLSX/PDF matching selection. | Older horizontally scrolling table; inconsistent punctuation/spacing, generic purchase chart labels, no mobile card view for records. |
| `/app/companies`, `/[id]` | Local CRUD/profile/VAT periods/switching, archive confirmation/recovery, invoice/supplier/member navigation. | No actual access control. Local currency defaults must not rewrite old invoices. No authenticated membership provisioning. |
| `/app/team` | Local member records, role/status changes, invitation drafts; no delivered invitations or real grants. | **P1:** 780px table on mobile, no search/sort/pagination, older loading/copy presentation. Retain all existing modal labels/actions used by regressions. |
| `/app/settings` | Guarded profile/business/notification forms, save/reset, local company JSON download; security/account explain unavailable services. | Missing integration-status overview and session interface; current security is explanatory text only. Settings tab selection is visual without programmatic current/pressed state. |
| `/app/audit` | Company-local activity list clearly disclaims secure audit. | Wide unpaginated table; no search/date filters or mobile cards. |
| `/app/support`, `/app/subscription` | Local help/tickets/replies/status; informational plans. Honest external delivery/billing limitations. | No support delivery, attachment persistence or payment integration. Long local ticket lists; inconsistent punctuation. |
| `/app/pos` | Existing local POS invoice entry/draft/confirmation. | Preserve as existing behaviour; no ORS work. |
| `/app/admin` | Directly reachable local operational/demo console, absent from navigation. | Stale architecture suggestions/readiness copy; hiding navigation is not authorization. Needs a future honest unavailable screen or verified authorization before real admin operations. |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/onboarding` | Demo/local account presentation, not production identity. `auth-form-page`. | Real authentication/session journeys backend-dependent; do not simulate account security. |
| `/`, `/about`, `/product`, `/benefits`, `/features`, `/how-it-works`, `/mobile-app`, `/pricing`, `/faq`, `/contact`, `/support`, `/security`, `/privacy`, `/terms` | Existing branded public pages using `public-shell`, `public-pages`, product mockups; metadata/robots/sitemap. | Marketing/legal/pricing claims need separate owner review; contact delivery unavailable. No public-site rewrite in this first batch. |

## Cross-cutting UX, responsiveness and accessibility

- Existing green/white tokens, shell, one-active navigation, company selector,
  unavailable ORS presentation, mobile drawer/bottom navigation, focus rings, modal
  keyboard containment, unsaved-form guards and feedback components are worth
  preserving. Existing tests cover several but not all WCAG requirements.
- **Confirmed from source:** mobile FinancialTable hides its sortable table header
  without a replacement sorting control. Shared pagination lacks an announced
  result/page status. Team/audit/report pages use older wide tables; horizontal
  scrolling contains the table but makes their mobile journeys awkward.
- Settings buttons lack pressed/current state. Some loading messages contain `?`,
  and copy uses inconsistent punctuation; supplier/report/settings styles vary.
- No new dead link is established from the inspected source. Local invite, ticket,
  billing, login and ORS actions must be assessed by their stated local/unavailable
  behaviour; they are not successful external integrations. The direct admin route
  is a design/authorization gap, not proof of a secure admin boundary.
- This is a source audit, not proof every breakpoint or screen is visually sound.
  Browser checks in this phase will cover changed screens and existing regressions;
  no WCAG certification or exhaustive assistive-technology audit is claimed.

## Prioritized incremental implementation

1. **This batch:** correct dashboard direction labels and add filtered, reviewed
   Purchase/Sale/unclassified summaries with separate currencies and clearly labelled
   recorded input/output difference; mobile/keyboard table sorting and page feedback;
   responsive searchable team management. Do not change invoice calculation modules.
2. Add customer/sales workflows with explicit identity/snapshot boundaries, direction
   filtering and contact editing designed against the existing domain. Add customer
   persistence only through reviewed additive upgrade rules, never reseeding records.
3. Standardize report/activity tables and supplier/document pagination; improve
   filter discoverability and contextual recovery/empty states. Refine Settings
   integrations and session presentation while keeping backend actions unavailable.
4. Review direct admin/public/account claims, production error boundaries and
   loading screens, and complete route-level keyboard/contrast/screen-reader QA.
5. Backend integration remains a separate approved phase. Local records are not
   secure shared persistence; no production-readiness claim follows from UI polish.

Acceptance for this batch: no change to existing VAT math/classification/persistence;
no mislabelling unknown direction; drafts excluded from the reviewed VAT position;
no mixed-currency grand total; filters/company switch update all derived summaries;
keyboard/mobile sorting works; team manage/invitation-draft journeys still work;
changed screens fit tested widths; existing type/build/unit/browser checks pass.

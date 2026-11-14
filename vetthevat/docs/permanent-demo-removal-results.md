# Permanent demo removal and application cleanup

22 October 2026. Application-code cleanup and local verification are complete.
**Verification of the user's actual existing browser profile remains outstanding.**
The application remains gated; real authenticated financial use is not enabled.
No deployment or external-system change occurred.

## 1. Exact changed files

`permanent-demo-removal-change-inventory.json` lists every added, modified and
deleted source/report/screenshot file with SHA-256 hashes. The project has no Git
checkout; hashes were captured before editing. Generated `.next` output and ignored
`.cleanup/` verification files are not application source. Package versions,
lockfile, database drafts, proxy authorization and Firebase configuration were not
changed in this cleanup.

The main changes are:

| Files | Result |
| --- | --- |
| Removed `lib/demo-data.ts`, `lib/mock-data.ts`, `lib/ors/fixtures.ts` | Seeded companies, financial records, suppliers, documents, notifications, support conversations, team members, ORS materials/suppliers and fixture order workflows are absent from application source. Historical regression fixtures live under `tests/fixtures/` only. |
| Removed `lib/remove-demo-data.ts`; added `lib/workspace-bootstrap.ts` | Replaced fixture-based automatic deletion with empty initialization and read-only hydration. Identity-only historical references flag records for review without classifying them as fake. Added exact raw metadata export. |
| `components/app-state.tsx`, `lib/legacy-review.ts` | Hydration performs no writes/deletions. Existing confirmation/selection/recovery protections retained. Before explicit deletion, snapshot now includes exact original raw metadata as well as the normalized recovery workspace. Recovery exports prefer the raw copy. |
| `lib/workspace.ts` | Preserve saved records and historical preferences; allocate a fresh empty bank object when old data has no banking section. |
| `lib/ors/workspace.ts`, `components/ors-workspace.tsx`, `lib/ors/contracts.ts` | ORS has no materials, suppliers, requests, orders, receipts, movements, approvals or attachments by default. Replaced interactive sample transactions with honest setup-required empty sections. No write control is enabled. |
| `app/app/subscription/page.tsx`, `components/app-shell.tsx` | Removed local usage/expiry/autopay simulation forms and renewal preview warnings. Authoritative allowance, usage and billing history display Unavailable. Approved pricing remains unchanged. |
| Removed `components/subscription-preview-warning.tsx`, `lib/subscription-preview.ts`; added `lib/subscription-contracts.ts` | Inactive legacy preferences survive storage round trips but never drive account status, reminders or access. Historical comparison utilities moved to test fixtures. |
| `lib/invoice-supplier.ts` | New supplier profiles can be created with a validated, explicitly reviewed invoice save, never during OCR or unreviewed draft saving. Existing company matches can still be linked to drafts. |
| `lib/services.ts`, `components/app-state.tsx` | Replaced demo/mock service names with browser-specific names. Retained genuine file parsing/review/export behavior; browser-local storage is not presented as permanent document storage. Invoice identifiers use crypto UUIDs. |
| `components/invoice-review-workflow.tsx`, `components/document-viewer.tsx`, `app/app/admin/page.tsx`, `lib/server/config.ts` | Removed obsolete demo-mode wording; retained honest persistence/integration limitations. |
| `.gitignore`, `.vercelignore` | Exclude cleanup verification state. Tests/fixtures, docs, recovery and private financial routes remain excluded from the temporary marketing Vercel upload. |
| Tests and screenshots | Updated tests for preservation rather than automatic deletion, relocated fixture imports, added production-source/bundle checks and a restart-capable isolated browser regression. See inventory for all test filenames. |

## 2. Authentication and production-route review

No active demo login, guest entry point, hardcoded administrator password, fake
session creation or localStorage authentication bypass was found in the current
application. Those access paths were already denied before this change. That
boundary is preserved: the proxy blocks private `/app/*` routes and financial
`/api/*` calls, and the workspace layout independently requires server-side
administrator verification. `administratorAuthServices()` remains unconfigured.
The Stage 1 API's dependencies also remain unconfigured. Client team roles and
stored `role`/`isAuthenticated` values are not authorization.

Every existing private page was tested by direct URL, including parameterized
invoice/customer/supplier/document/company pages and ORS: **25 pages returned
307 to the unavailable-auth notice**. The tests supplied a forged session,
Owner header and middleware-subrequest header. Twelve GET/POST/PUT/DELETE calls
against API roots, existing versioned paths and the Stage 1 upload path returned
401. RSC/prefetch navigation was also denied. No session cookie was created.
The unconfigured logout endpoint returned 503; no successful authenticated logout
is claimed. Marketing-only mode's deny-all boundary remains unchanged.

Public setup pages contain no credential form or financial records. The existing
public dashboard/phone illustrations contain no fabricated financial figures.
There is no fallback to a seeded workspace after authentication/API failure.

## 3. Storage cleanup and data preservation

Known business storage locations:

* `vet-the-vat-workspace-v1`: companies, invoices, line items, suppliers, customers,
  documents, banking, support, local activity, notifications, settings and any
  historical preference fields.
* `vet-the-vat-before-demo-cleanup-v1`: an older cleanup's recovery copy. Preserved
  unchanged; this cleanup does not create, remove or automatically restore it.
* `vet-the-vat-legacy-review-*`: user-confirmed deletion recovery archives.
* Unrelated/local authentication-like keys are ignored, not cleared or trusted.
  No business data is seeded into sessionStorage.

Fresh storage remains untouched and hydrates to empty collections. Existing
storage is parsed without automatic filtering, deletion or rewriting. Even exact
historical fixture content is retained: it may be genuinely edited or referenced
by other records. Names, dates and amounts are never evidence for deletion. Old
record IDs only create review candidates, not an assertion that records are demo.
Ambiguous historical records may remain visible in the protected local workspace
until the owner reviews them; they are not falsely certified as genuine.

The existing Legacy Data Review workflow requires an explicit selection, a
confirmation dialog and acknowledgement. Company deletion is excluded; linked
invoices/originals/suppliers/banking/history are protected. A private recovery
snapshot must save before deletion is committed. The new raw snapshot/export
preserves original JSON whitespace, unknown fields and legacy preferences.
Recovery merges selected rows without overwriting newer identities. Original
financial file bytes are not included in metadata exports and may no longer be
available from an old browser session.

The export/removal UI remains behind authentication. It has not been made public
as a workaround. No private export was taken from the user's existing browser,
and no record in that profile was removed. Manual inspection/export requires the
owner's browser access and the approved authentication/recovery path. The cleanup
cannot certify that profile's records or whether previous versions removed data.

## 4. Financial features retained

Invoice upload, PDF.js/Tesseract extraction, review, manual entry, company-scoped
supplier matching, VAT calculations, filters/search and exports remain in code.
VAT arithmetic was not changed. A new supplier is staged only with a confirmed,
reviewed invoice, and published together with its validated save.

Dashboard/report/chart functions already aggregate supplied stored records; their
empty inputs produce zero totals and empty chart/activity arrays. Banking starts
without accounts or transactions. No artificial balances/reconciliations were
introduced. The ORS replacement starts empty and cannot synthesize orders.

Approved plans remain Basic GBP9 / 30 invoices / 2 companies / owner+1, Starter
GBP15 / 100 / 2 / owner+3, Growth GBP25 / 300 / 3 / owner+5. Basic ORS is optional
GBP5; Starter/Growth include it as plan metadata. Comparison controls never activate
access. No active subscription, payment, billing history or usage is fabricated.
Old browser preference fields are preserved as inert metadata, not billing facts.

All existing local financial interfaces remain protected and identify their
browser-only limitations. They are not presented publicly as durable financial
storage. Real customer operation requires the backend integrations below.

## 5. Validation and screenshots

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; no deployment. |
| `npm test` | **137 passed, 0 failed**. Includes existing invoice/extraction/VAT/quota tests plus preservation, supplier review, empty-state, billing and production-source regression tests. |
| `node tests/verify-cleanup-build.cjs` | Passed: **889 served server/client build artifacts** inspected after browser generation; no checked seed/company/supplier/material names, demo entry options, fixture credentials or billing simulator controls. No test-fixture path in server dependency traces. Caches/historical docs are excluded from this scan. |
| `node tests/browser-invoices.cjs --cleanup-only` | Passed in fresh, temporary Chrome profiles against the loopback production server, with actual Chrome restarts. |
| Genuine-record preservation evidence | Mixed historical synthetic data, a synthetic user edit, a new invoice/customer/bank account, unknown-field metadata and old recovery bytes survived byte-for-byte. Exact raw metadata export was verified. No real customer records were used. |
| Fresh-browser evidence | Actual bootstrap functions produced empty collections without storage writes, across reload and a fresh-profile restart. No company was created by visiting the site. |
| Production security evidence | 25 private page denials, 12 API denials, RSC denial, forged local/session role flags ignored, no session creation. |
| Actual user's browser profile | **Not inspected. Manual verification remains outstanding.** |
| Signed-in financial/ORS workflows | **Blocked by unconfigured real authentication; not claimed as end-to-end passes.** No test bypass added. |

Fresh-browser screenshots at 390 and 1440 pixels:

* `docs/previews/permanent-cleanup/fresh-access-blocked-390.png` and `-1440.png`:
  actual setup-required screen, no demo login option.
* `docs/previews/permanent-cleanup/fresh-public-home-390.png` and `-1440.png`:
  actual public home page without seeded financial figures.
* `docs/previews/permanent-cleanup/ors-empty-component-390.png` and `-1440.png`:
  the real empty ORS component rendered in an explicitly labelled isolated DOM
  with production CSS. These are **component QA images, not signed-in application
  screenshots**. Production ORS navigation is still denied.

The screenshots were checked for overflow; the mobile setup/empty ORS renders
were also visually inspected. Browser and machine-readable results are summarized
in `permanent-demo-removal-verification.json`.

## 6. Remaining backend blockers and Vercel status

The cleanup does not activate Firebase sessions/membership resolution, trusted
database context, approved PostgreSQL schema/RLS/write privileges, durable private
object storage, content scanning, production OCR workers, a shared rate store,
security audit delivery or authoritative billing. Earlier Stage 1 local code is
retained, but its adapters/schema remain unapproved/unconfigured. Actual database
tenant-isolation and concurrency tests remain outstanding. The former Stage 1 ORS
fixture UI and local billing previews have been removed by this change.

The next marketing build is prepared without the identified demo features or
seeded business records. `.vercelignore` still excludes private workspace/API/auth
sources, test fixtures, backend/database material and recovery data. **The full
financial application is not ready for customer production use.** Deployment
requires separate approval; no Vercel deployment or environment change occurred.
Existing unrelated release/dependency checks still apply.

No changes were made to `D:\vetthevat-backup`, the published Flutter apps,
production Firebase, PostgreSQL, Cloudflare/GoDaddy DNS, payment or email services.

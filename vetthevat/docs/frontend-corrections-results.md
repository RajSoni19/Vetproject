# Critical frontend corrections — 20 October 2026

This is a correction pass, not a new milestone or backend integration. Acceptance is **partial**: the existing owner's browser profile is not accessible through the connected tools, and seven dependency findings remain. The immutable backup, PostgreSQL, Firebase, Flutter, payment services and email services were not accessed or changed.

## Sources of sample data and treatment

| Source | Verified behaviour and resolution |
| --- | --- |
| `lib/demo-data.ts` | Former hardcoded companies, invoices, documents, suppliers, members, support, activity and notifications remain only as legacy identity/content fingerprints for conservative cleanup and explicit test fixtures. They are not initial workspace data. |
| `lib/mock-data.ts` | Older mock module has no application imports. Public pages use `lib/site-links.ts` for the app-store URL, not financial fixtures. |
| `components/app-state.tsx`, `lib/remove-demo-data.ts` | Initial workspace is empty. Hydration reads only the workspace key. Exact unchanged fixture rows can be removed; dependencies of retained genuine/edited rows are preserved. No blanket storage clearing or name/amount/date-only matching. |
| Browser `vet-the-vat-workspace-v1` | Old saved samples can survive source updates. Cleanup saves original raw JSON to `vet-the-vat-before-demo-cleanup-v1` before overwriting. Backup failure prevents overwrite. Repeated loading does not seed data. Neither key is exported or printed. |
| Edited or linked legacy records | New `legacyDemoReview()` and `LegacyDataReview` identify retained legacy fixture IDs as **ambiguous**, not deletable. A visible workspace warning explains that these records still affect local figures. Expand the warning to review record references. IDs establish possible provenance, not certainty. User-created records with different IDs are untouched. |
| Dashboard, invoice/contact lists, reports, banking and activity | Source review found metrics and lists derived from current workspace records, not new hardcoded figures. Banking initializes with empty accounts, transactions, allocations and events. Ambiguous retained records can legitimately still appear; no claim is made that the owner's exact visible rows were identified without browser access. |
| Public product illustrations and calculator | Existing empty illustrations remain. Calculator starts blank; no checked sample checklist or fabricated account totals. |
| `lib/services.ts` | Legacy names `mockInvoiceProcessingService` and `demoDocumentStorageService` remain for compatibility. Inspection confirms content parsing and session-file metadata; these names do not seed sample invoice records. Original bytes remain session-only. |
| Subscription preview | Dates remain blank until entered. No active subscription, trial dates or paid usage is fabricated. Local comparison values never activate access. |

Synthetic browser checks verified fresh empty startup, cleanup of a previously seeded workspace, exact backup, no reappearance on reload, and preservation of an edited legacy invoice with a visible review warning after repeated reloads. This is not evidence from the owner's existing profile.

Existing-profile verification was attempted: native computer-use initialization failed with “failed to write kernel assets … path specified”; the browser inventory returned `apps: []` and `browsers: []`. No owner-profile files were opened or copied. To complete this gate, connect the existing localhost tab to browser tooling, then reload it and inspect the warning/records. Do not clear site data. If using an already-running production preview, restart that local app process against the current build before reloading; no existing process was terminated by this pass.

## Plans and account usage

`lib/plan-catalog.ts` is the client-safe typed source shared by public pricing, workspace plan cards, usage preview and server contract foundations. Existing server imports remain compatible.

| Plan | Monthly GBP | Invoice creations | Companies | Team | History | ORS |
| --- | --- | --- | --- | --- | --- | --- |
| Trial | Not specified | 20 during verified trial | Not specified | Not specified | Not specified | Not assumed |
| Basic | 9 | 30 / billing period | 2 | Owner + 1 | 90 days | Optional 5; total 14 |
| Starter — recommended | 15 | 100 / billing period | 2 | Owner + 3 | 180 days | Included commercially |
| Growth | 25 | 300 / billing period | 3 | Owner + 5 | Unlimited | Included commercially |

All paid plans list supplier/customer management, uploads/OCR, manual entry, VAT calculations, quarterly/yearly reports and PDF/CSV/Excel export entitlements. Growth lists priority support. These are commercial terms, not a claim every integration or export format is operational. Banking entitlement is explicitly “Not confirmed”. ORS is not implemented or enabled.

Public `/pricing` now uses the same cards as `/app/subscription`. The Basic ORS checkbox is a comparison only, Starter is visibly recommended, and local usage comparison can use any paid catalogue allowance. Card/Direct Debit controls collect no credentials; reminders remain local preferences with email unavailable. Verified status, usage and trial end remain unavailable. No existing implemented trial-expiry duration was found; none was invented or changed. The future reservation contract supports Trial's 20 creations using the trusted resolver's existing start/end validation. Its ledger remains an unimplemented port. Trial SQL/provider integration remains future review work.

Account-wide tests cover 70 creations leaving 30 Starter slots across companies, unique invoice IDs on repeated previews, and existing injected-ledger concurrency/idempotency checks. Browser-local records cannot prove account ownership, deleted-record usage or other-device activity. Server enforcement, history access enforcement and product permissions are not operational.

## Dependency remediation

The registry-backed **before** audit confirmed 6 high and 2 moderate findings. An initial sandbox-only audit incorrectly returned no findings; it was rejected as evidence after checking the installed tree and repeating against the public registry.

With explicit owner approval, `xlsx@0.18.5` was replaced with the exact maintainer tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, lifecycle scripts disabled. License: Apache-2.0. Lock integrity: `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`. Only the root package record and xlsx entry changed; eight now-unused SheetJS transitive entries were removed, no unrelated packages upgraded. See the [maintainer installation instructions](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

| Package / installed version | Severity / relationship | Advisory, exposure and disposition |
| --- | --- | --- |
| xlsx 0.18.5 → **0.20.3** | High / direct | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), prototype pollution fixed from 0.19.3; [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), ReDoS fixed from 0.20.2. Browser banking workbook imports and exports are reachable. Updated; final audit no longer reports this package. Import/export compatibility requires the browser and workbook regressions below, not just a version check. |
| braces 3.0.3 | High / transitive | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), recursive pattern stack exhaustion. No patched version listed. Build/dev glob inputs; no upload-to-glob path found. Unresolved. |
| chokidar 3.6.0 | High / transitive | Inherits braces advisory through Tailwind's build/dev watcher. Remove affected dependency path through reviewed tooling migration; unresolved. |
| micromatch 4.0.8 | High / transitive | Inherits braces advisory in source matching. Build/dev exposure; unresolved. |
| fast-glob 3.3.3 | High / transitive | Inherits micromatch/braces advisory in source scanning. Build/dev exposure; unresolved. |
| tailwindcss 3.4.17 | High / direct development | Inherits glob/parser findings. Audit proposes 4.3.3, a major migration, not an in-place safe patch. Theme, PostCSS integration, utility semantics and browser baseline need review. Unresolved. |
| postcss-selector-parser 6.1.4 | Moderate / transitive | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), selector CPU exhaustion, fixed 7.1.6. Repository CSS processing at build/dev time; a major override is not assumed compatible. Unresolved. |
| postcss-nested 6.2.0 | Moderate / transitive | Inherits selector-parser finding. Build/dev stylesheet processing; unresolved. |

Final registry-backed audit: **5 high, 2 moderate, 0 critical**. Raw evidence: `frontend-corrections-audit.json`. No suppression, force-fix or waiver. Build-only reachability is not a claim of safety or verified absence from a deployed image. No Docker image/deployment was tested here.

Next dependency approval: a separately reviewed migration to `tailwindcss@4.3.3` and `@tailwindcss/postcss@4.3.3`, whose availability was checked with read-only public-registry metadata queries. This requires CSS/config conversion and a full visual/browser matrix, including browser compatibility and shadow/border/reset changes. Follow the [official upgrade guide](https://tailwindcss.com/docs/upgrade-guide); it changes configuration and utility behaviour. Neither package was installed. Existing CSV byte/row/column limits and isolated XLSX worker timeout remain; they are containment, not a complete malicious-workbook sandbox. Tests include malformed CSV, worker bounds and hostile-looking spreadsheet headers/formula text; they do not constitute exhaustive exploit or decompression-bomb proof.

## Validation and evidence

- `npm run typecheck`: passed.
- `npm test`: 88 passed, 0 failed after the SheetJS upgrade; includes financial/classification/export regressions, new plan/history/trial tests, cross-company unique usage, legacy preservation/review and hostile-looking cell-text roundtrip.
- `npm run build`: passed on final source (43 static pages plus dynamic detail routes).
- `node tests/browser-invoices.cjs --corrections-only`: final rerun passed. Verified exact ORS price text, Basic comparison without storage changes, catalogue-based Basic usage, and Starter detail interactions. Pound-symbol and tablet public-navigation regressions discovered during this pass were corrected.
- `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2 --frontend --frontend-batch2`: passed, no uncaught page exceptions. Real digital/scanned PDF and PNG/JPG/JPEG extraction, retry/error/recovery, manual/draft/edit/confirmation, single-invoice and filtered exports, supplier/company/document flows, CSV/XLSX imports, banking partial/split/reversal, navigation/focus/dirty-state protection, and responsive regression coverage. Existing POS tests ran without developing POS/ORS functionality.
- `node tests/browser-invoices.cjs --release-frontend-only`: passed against final build: customer/sales draft-confirm/history/snapshots, renewal preferences, supplier/document pagination/reset and 320/390/768/1440 widths.
- Focused checks exercise real rendered pages and save eight synthetic pricing/subscription screenshots at 320/390/768/1440 widths under `docs/previews/frontend-corrections/`. Desktop pricing and mobile subscription screenshots were visually inspected. This is not a full WCAG conformance audit.
- Existing lint remains unavailable: `next lint` script is unsupported by Next 16; no new lint dependency was installed and no lint pass claimed.

Recoverable originals: `.recovery/frontend-corrections-20261020/`. No Git repository exists; no Git initialization or remote was performed. Exact source changes, hashes and protected-file checks are in `frontend-corrections-change-inventory.json`.

Outstanding acceptance: owner-profile inspection; Tailwind dependency remediation; real authenticated subscription/trial usage and billing services. This pass does not claim production readiness or complete removal of every ambiguous legacy row.

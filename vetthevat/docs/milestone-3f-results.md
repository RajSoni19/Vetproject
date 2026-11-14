# Milestone 3F — frontend verification and security remediation

20 October 2026. Existing application retained; no redesign, database access, migrations, Firebase/Flutter/ORS implementation, production-service access, payment processing, email or deployment. `D:\vetthevat-backup` was not modified. Financial calculation, tax classification, extraction and plan-policy source files remain unchanged, as recorded in the change inventory.

## Dependency findings and remediation

Fresh registry-backed audit before this pass: **5 high, 2 moderate**. The vulnerable dependency paths were:

```
tailwindcss@3.4.17
  chokidar@3.6.0 -> braces@3.0.3
  micromatch@4.0.8 -> braces@3.0.3
  fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3
  postcss-nested@6.2.0 -> postcss-selector-parser@6.1.4
  postcss-selector-parser@6.1.4
```

| Package | Before | After | Advisory / affected path |
| --- | --- | --- | --- |
| postcss-selector-parser | 6.1.4, moderate | **7.1.6; no finding** | [GHSA-rj75-hqrm-r3gf / CVE-2026-104844](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), quadratic selector CPU exhaustion; patched from 7.1.6. |
| postcss-nested | 6.2.0, moderate inherited | 6.2.0; **no finding** | Its parser now resolves to 7.1.6. |
| braces | 3.0.3, high | 3.0.3, high | [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), recursive glob pattern stack exhaustion; advisory lists no patched version. |
| chokidar | 3.6.0, high inherited | Unchanged, high | Inherits the braces advisory through the watcher. |
| micromatch | 4.0.8, high inherited | Unchanged, high | Inherits the braces advisory through glob matching. |
| fast-glob | 3.3.3, high inherited | Unchanged, high | Inherits the micromatch/braces chain. |
| tailwindcss | 3.4.17, direct development dependency, high inherited | Unchanged, high | Owns the affected watcher/glob dependency paths. |

Applied the narrow root override `postcss-selector-parser: 7.1.6`. This replaces vulnerable code; it does not suppress an advisory. Version 7 changes insertion-during-iteration behaviour, so compatibility was tested rather than assumed: the captured pre-change application sources produced **byte-identical 53,497-byte CSS** with 6.1.4 and 7.1.6. A small committed golden fixture verifies theme colours, responsive/arbitrary selectors, placeholder/disabled/focus/hover styles and preflight against old-parser output. A 12,000-selector input and malformed selector regression also pass.

Only `node_modules/postcss-selector-parser` changed in the lockfile, from 6.1.4 to 7.1.6; no added/removed lock entries, unrelated upgrades or stale parser 6.x entries. The old parser tarball is retained only under the ignored `.recovery` directory for before/after testing; it is not an application dependency or Docker build input. No `npm audit fix --force`, advisory suppression or risk waiver was used.

Fresh final audit evidence:

- Full dependency tree: **5 high, 0 moderate, 0 critical** — `milestone-3f-audit-full.json`.
- Production dependencies (`--omit=dev`): **0 reported findings** — `milestone-3f-audit-production.json`.
- 50 generated Next runtime trace files inspected: none reference these seven build-toolchain packages — `milestone-3f-runtime-traces.json`.

Exposure: Tailwind/glob matching and selector parsing run in development and production **builds**. No application import or invoice/CSV/XLSX-upload path into the glob toolchain was found. The observed production dependency/trace results support a build-time classification, but are not proof about a future deployed container, dynamically loaded modules or all possible runtime paths. No container was built or deployed in this pass.

### Remaining high findings and controls

No patched braces release or compatible Tailwind 3 patch removes the chain. Registry inspection showed Tailwind 3 releases through 3.4.19, still within the affected audit range. The audit proposes Tailwind 4.3.3. That is a separate framework migration, not a safe patch: the [maintainer upgrade guide](https://tailwindcss.com/docs/upgrade-guide) documents new PostCSS integration, CSS/preflight/utility differences and Safari 16.4+/Chrome 111+/Firefox 128+ requirements. This pass does not silently change the supported browser baseline or redesign styles to obtain a green audit.

Existing controls: template/CSS/glob inputs are repository-owned rather than uploaded invoice content; Docker configuration separates the build stage from traced runtime output; recovery files are excluded from Git and Docker context. The existing verification workflow still uses a high-severity audit gate and will remain blocked by these findings; it was not weakened or run remotely. Recommended operational controls until migration: keep development listeners loopback-only, do not build untrusted templates/CSS/glob patterns, use resource-limited isolated build workers without production credentials, and do not ship development dependencies. These deployment/runner controls were not independently verified as operational here.

Next security decision: approve a reviewed Tailwind 4 migration and its browser baseline, or retain the release blocker. No claim that five high findings are resolved.

## Seeded-data audit and explicit review

- `emptyWorkspace()` and AppState initialization contain zero companies, invoices, suppliers, customers, documents, banking records, notifications, tickets, team or activity rows.
- Runtime use of `lib/demo-data.ts` remains limited to full-content cleanup fingerprints and possible legacy identity detection in `remove-demo-data.ts`; it is never used to seed a workspace. `lib/mock-data.ts` has no application imports.
- Dashboard/report amounts and charts derive from saved invoice records through the existing reporting/calculation components; no placeholder totals were introduced. Ambiguous retained legacy records are explicitly included in those local figures, with a visible warning.
- Exact unchanged seed cleanup remains conservative, backs up the previous workspace and is idempotent. Names, amounts, invoice numbers or dates alone never authorise removal.
- Edited legacy records remain untouched until the owner selects them and confirms deletion. New `legacy-review.ts` allows only legacy-identity selections, rejects duplicate/missing identities, and performs no cascade deletion. Companies use the existing archive journey instead.
- Remaining invoice/document/supplier links, current banking allocations and historical allocation snapshots block conflicting deletions. Pre-existing broken links also block this review workflow rather than being silently repaired or removed.
- The confirmation lists the selected record references and requires an unchecked acknowledgement. Cancel leaves data unchanged. Unsaved-form navigation protection remains in effect.
- Before any deletion, a separate private browser-local snapshot of all-company metadata must save successfully. Storage failure blocks deletion. A normal workspace commit failure also cannot publish success; an unreferenced recovery snapshot may remain if that later write fails.
- The review panel offers explicit all-company metadata export before removal and export of saved recovery snapshots afterward. Exports remain on the user's machine; no data is uploaded or printed. They contain private metadata and must be stored securely. **Original document bytes are not included**. Exported JSON is an independent metadata copy; a generic backup-file import UI is not implemented. In-app undo uses the saved browser recovery snapshot.
- Recovery merges only the selected records. It preserves newer records and refuses identity collisions or broken restored dependencies. Snapshot references protect recovery dependencies and explicitly restored records from automatic cleanup on reload. Existing recovery snapshots are not silently deleted or overwritten. Browser storage remains insecure and non-durable; clearing site data loses local snapshots.

UI entry: the amber **Legacy records need your review** panel → **Review retained record references** → select rows → optionally **Export metadata before review** → **Review selected deletion** → acknowledge and confirm. Use **Recovery snapshots** to export or restore a selection. This workflow was exercised only with synthetic records; no actual owner records were deleted.

### Existing owner profile — still unverified

The connected browser inventory was checked again and returned `apps: []`, `browsers: []`. The owner's existing localhost profile was not opened, copied, cleared or exported. Manual verification remains required:

1. Open the current local app and reload the tab; restart its local server against the current source/build if it is serving an older build. Do not clear site data.
2. Confirm your genuine records remain and review any amber legacy warning. Inspect linked records before selecting anything; edited seed identities may be genuine records.
3. Use the explicit export/confirmation/recovery journey only for records you personally identify as disposable. Keep a secure metadata copy and the original files separately.
4. Reload again; confirm selected removals stay absent and genuine records/totals remain correct. Connect that tab to browser tooling for assisted verification if desired.

Synthetic verification is not evidence that this manual owner-profile gate has passed.

## Subscription acceptance

The unchanged typed `plan-catalog.ts` remains the shared source:

| Plan | GBP/month | Invoice creations | Companies | Team | ORS |
| --- | --- | --- | --- | --- | --- |
| Basic | 9 | 30/month | 2 | Owner + 1 | Optional 5; combined 14 |
| Starter | 15 | 100/month | 2 | Owner + 3 | Included |
| Growth | 25 | 300/month | 3 | Owner + 5 | Included |

Tests cover prices, seats, companies, upload/OCR and manual-entry entitlement metadata, Basic ORS comparison, shared usage previews, history terms and trial metadata. Browser checks cover public/workspace cards, Starter recommendation, Basic+ORS total, comparison-plan allowance, mobile/desktop layouts, no payment inputs and no saved account/access changes from plan comparison. Verified subscription/period/usage and trial end remain unavailable. Card/Direct Debit and email preferences are previews. Product access, subscription quotas, company/member limits and history restrictions are **not server-enforced** by these UI tests; ORS remains unavailable and unimplemented.

## Verification and changed files

Screenshots are synthetic, not customer records. Final checks:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed on final source. |
| `npm run build` | Passed on final source; 43 static pages and existing dynamic routes. |
| `npm test` | 94 passed, 0 failed. Includes CSS compatibility, selector input handling, financial/classification/export regressions, explicit legacy selection, link/banking protection, conflict-safe recovery and shared plan terms. |
| `node tests/browser-invoices.cjs --milestone3f-only` | Passed against final build. Fresh collections empty; unchanged seed cleanup/reload; edited seed preservation; pricing/ORS comparison and local usage; acknowledgement/link/cancel protection; metadata download; forced backup-write failure; selected invoice/document removal; genuine synthetic draft/supplier/customer/transaction preservation; reload/additive recovery; 320px confirmation and focus. |
| `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2 --frontend --frontend-batch2` | Passed. Real digital/scanned PDF and image OCR, upload failure/retry/stale selection, draft/edit/confirm, classification and filtered/single-invoice exports, supplier/company/document recovery, banking CSV/XLSX/partial/split/reversal, responsive and keyboard/unsaved-navigation checks. No uncaught page exceptions. Existing POS regression exercised without developing ORS/POS. |
| Full public-registry dependency audit | 5 high, 0 moderate; documented above. |
| Production-only public-registry dependency audit | 0 reported findings; does not waive build findings. |

`node tests/browser-invoices.cjs --release-frontend-only` also passed against the final build: customer/sales draft-confirm/history/snapshot, local usage and renewal/autopay preferences, supplier/document 12/12/1 pagination and filter reset, and 320/390/768/1440 widths. No paid activation or external payment/email calls were made. Existing lint is still unavailable because the repository uses the unsupported `next lint` script and has no installed ESLint; no lint pass is claimed.

Screenshots under `docs/previews/milestone-3f/`: desktop/mobile pricing, desktop/mobile subscription and the 320px legacy deletion confirmation. Desktop pricing and the 320px confirmation were visually inspected. Automated subscription checks cover widths 320/390/768/1440; the broader regression suite includes 1024 as well. This is not an independent WCAG conformance assessment.

Recoverable originals are under the `.recovery/milestone-3f-*` directory recorded in `milestone-3f-change-inventory.json`. No Git repository exists; no Git initialization or remote was performed. The inventory lists exact source/config/test/evidence paths and hashes.

Release blockers: five high tooling findings; manual existing-profile verification; real authenticated persistence, authoritative subscription enforcement and durable original storage remain unconnected. This milestone does not establish production readiness.

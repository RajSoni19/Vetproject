> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Frontend completion and release security review

20 October 2026. **Release status: blocked for production.** This stage adds local
frontend workflows and reviews infrastructure; it does not connect authentication,
PostgreSQL, subscriptions or private storage. No migrations, production access,
Firebase/Flutter changes, ORS development, payment/email actions or deployment.
`D:\vetthevat-backup` is unchanged. Recoverable originals are under
`.recovery/frontend-release-20261020-205935`; Git is still absent.

## Implemented frontend

| Area | Source and actual behaviour |
|---|---|
| Customers | `/app/customers`, `/app/customers/[id]`, `components/customer-workspace.tsx`, `lib/customers.ts`: company-scoped directory, search/status filters, sortable/paginated desktop table/mobile cards, create/edit/archive via status, contact details, duplicate warnings, sales history and new-sales action. Browser-local records; not access control. |
| Sales | `components/invoice-editor.tsx`, `/app/invoices/new?customer=...`, `lib/invoice-rules.ts`: customer selection and snapshots, issuer labels, customer required on confirmation, draft/reload/confirmation; sales numbers checked per company separately from purchase numbers. Editing contact records does not rewrite historical invoices. No payment, invoice emailing or customer delivery is performed. |
| Register/exports | `lib/invoice-filters.ts`, `/app/invoices`, `/app/invoices/[id]`, `lib/report-exports.ts`: direction filter (Purchase/Sale/Unclassified), customer search, counterparty display, customer ID retained in XLSX, sales counterparty in report PDF. Existing totals/classifications and export scope retained. PDF is a records report, not a newly claimed legally certified invoice template. |
| Suppliers/documents | Existing search/status/folder/availability/type/sort retained; 12-record pages, live page/count announcements, disabled bounds, page reset on company/filter changes. Supplier search also includes phone/address. Original files remain session-only. |
| Subscription UI | `/app/subscription`, `lib/subscription-preview.ts`: confirmed shared 100-invoice monthly rule; verified used/remaining explicitly unavailable. A separate user-selected UTC period preview counts distinct creation IDs across ALL browser companies, including drafts. Unknown dates disclosed. No authoritative account mapping, deletion history, pending reservations, other-browser data or actual quota enforcement. |
| Renewal/autopay | Local expiry date and in-app/email reminder preferences; visible preview warnings within 30 days, refreshed while app is open. Manual/Card/Direct Debit preference and disabled provider setup controls. No card/bank credential inputs, mandates, charges, recurring jobs or emails. Existing proposed plan comparison retained. |

No sample business data is reintroduced. New customers and optional invoice links
persist in the existing workspace without discarding existing invoices/settings.
Legacy sales without customer IDs appear by exact normalized name/VAT matching;
these are best-effort history associations and should be reviewed, not auto-merged.
Renaming an unlinked legacy contact can change that name-based view; explicit IDs
keep linked history stable. The database/API schema still needs customer tables,
company-qualified links and migration/import mapping before backend integration.

## Dependency findings: all reported packages investigated

Read-only `npm audit` reports **6 high and 2 moderate package findings**, zero
critical. See `release-dependency-audit.json` for exact ranges, paths and advisories.
These are dependency graph findings; several reflect the same underlying advisory.
No dependencies or lockfile were upgraded. No malicious exploit payload was run.

| Installed package | Severity / underlying issue | Reachability in this application (source inference) | Fix direction and regression risk |
|---|---|---|---|
| xlsx 0.18.5 | High: prototype pollution below 0.19.3 and ReDoS below 0.20.2 | **Reachable import path:** `components/bank-import.tsx: read()` calls XLSX.read on user-selected CSV/XLSX in the browser. 5 MB input cap/5,000-row checks do not fix parser bugs; row checks happen after parsing, and compressed workbooks can expand. Potential UI freeze/state contamination. No server-side workbook endpoint found. Export-only workbook generation is a distinct path, not evidence arbitrary file parsing is safe. | Maintainer builds at least 0.20.2 address the cited issues, but that is not a claim that any minimum version is free of later vulnerabilities. Review a current maintained build/source integrity/license and exact pin, or a replacement parser, before requesting dependency approval. npm reports no fix via the old registry package. Test statement dates, decimals, sheet selection, duplicate fingerprints, CSV/XLSX import and every report export. |
| braces 3.0.3 | High: deeply nested pattern stack exhaustion (GHSA-vfj7-8cjw-p6xm) | Tailwind build/watch glob chain. `tailwind.config.ts` content patterns are developer-controlled. No app route passes uploaded invoice/bank contents to this glob API. Build/PR contributors can change inputs; not demonstrated as a public request exploit. | Advisory currently lists no patched version. Review removing/replacing the affected chain; do not assume upgrading to 3.0.3 fixes this newer advisory. Test build content scanning, OCR workers and all responsive themes. |
| chokidar 3.6.0 | High inherited through braces | Development/watch tooling in Tailwind dependency tree; no direct customer request use found. | Upgrade/remove compatible watch chain only after version review; test Windows dev watching and Linux builds. |
| micromatch 4.0.8 | High inherited through braces | Tailwind content matching; same developer-controlled pattern boundary. | Review glob chain together; an isolated version bump may retain braces. |
| fast-glob 3.3.3 | High inherited through micromatch/braces | Tailwind build scanning; no frontend upload-to-glob link found. | npm marks fix available, but transitive chain must actually be removed/patched. Test scanning completeness; omitted styles can silently break UI. |
| postcss-selector-parser 6.1.4 | Moderate: quadratic flat-selector parsing below 7.1.6 | Build-time PostCSS on repository CSS, not customer-supplied CSS in a request handler. This is lower observed runtime reachability, not a waiver. | Upstream fix 7.1.6; parent uses an older major. Review compatibility instead of blindly forcing an override. Test CSS output, nesting and responsive/focus styles. |
| postcss-nested 6.2.0 | Moderate inherited from selector parser | Tailwind/PostCSS build chain. | Review a compatible parent upgrade and compare generated styles/screenshots. |
| tailwindcss 3.4.17 | High inherited through the above build chain | Dev dependency, not directly imported by business routes. Runtime image trace has NOT been built/inspected, so complete absence from the final image is not proven. | npm suggests Tailwind 4.3.3 (major); this requires reviewed dependency/tooling approval. Theme/PostCSS/config/content-scanning changes could affect every screen; do not run npm audit fix --force. |

Primary advisory sources reviewed:
[braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[selector parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf),
[SheetJS prototype pollution](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
[SheetJS ReDoS](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9),
[maintainer distribution guidance](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

**Release gate:** fix or explicitly review/accept the build-chain findings, and
remediate reachable spreadsheet import vulnerabilities before production import.
No automatic dependency upgrade, temporary security exception or vulnerability
suppression was introduced. CSV currently also passes through XLSX.read; it must
not be advertised as an independently safe fallback without a separate parser.

## Docker, build context and CI review

| Control | Verified source/configuration | Remaining proof/gap |
|---|---|---|
| Secret isolation | .dockerignore starts with deny-all and allowlists source/test/public/build inputs; .env/key/credential patterns excluded. Added .npmrc/.netrc, P12/PFX, serviceAccount JSON and database file exclusions. No secret Docker ARG/env or workflow secrets configured. | Patterns cannot catch credentials/client data embedded inside allowed TS/public/test files. Full secret scan, build-context inspection, image history and built client-bundle inspection remain release gates. No claim of exhaustive secret detection. |
| Least privilege | Workflow contents:read, checkout credentials not persisted, action commit pins; no pull_request_target, deploy job, registry login or image push. | No repository/branch protections/environments configured. Hosted runner/repository policy and workflow execution unverified. Untrusted PR code still runs tests; no secrets should be made available. |
| Non-root | Dockerfile final USER node; standalone/public/static copies only. Compose drops capabilities, no-new-privileges, read-only root, tmpfs caches, resource bounds and loopback port. | Docker is unavailable; build/start/non-root/read-only health/asset/OCR checks NOT executed. Compose sandbox restrictions are not implied by running the image separately. Select a reviewed image with the expected UID/cache/native-library compatibility. |
| Reproducibility | npm ci uses lockfile with scripts disabled; image requires explicit NODE_IMAGE, CI checks digest format. | No approved digest is configured/proven. Workflow uses Node major 22, not exact patch; npm/OS/browser and optional native dependencies are not fully pinned. No bit-for-bit reproducibility claimed. Build with reviewed inputs and retain provenance. |
| Deployment safety | No CD/deployment path added or run. Audit gate remains fail-closed at high severity. Added new frontend and cleanup browser checks to CI definition. | Gate currently fails existing advisories. Image scanning, SBOM, signatures, TLS/proxy/secret injection, staged promotion, restore/rollback and owner deployment approval still required. YAML parsing is not a CI run. |

The existing CSP allows inline scripts/styles and WASM execution for current Next/OCR
compatibility. Do not promise strict CSP/XSS protection. Nonce/CSP hardening requires
separate browser testing; future Firebase/payment/email providers also need reviewed
origin allowlists. Browser-local records are neither secure multi-user storage nor
reliably durable originals. Existing `next lint` command is invalid under Next 16;
ESLint is not installed and no lint pass is claimed.

Review guidance: [Docker](https://docs.docker.com/build/building/best-practices/),
[GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use).

## Quota and rate-limit contract review

`lib/server/account-usage.ts` is a port, not a ledger. Positive counted usage and
non-empty bounded reservation IDs now required on success; impossible zero-count
success fails closed. `lib/server/request-limits.ts` now rejects duplicate buckets,
blank/control-character keys before store access. No real endpoint/store is wired.

Required implementation invariants before enforcement:

1. Verify Firebase session server-side, resolve internal user and active company
   membership, then billing account. Never trust account ID, allowance, billing dates,
   identity or permissions supplied by the browser. One billing account can own
   several companies; a user's visibility across accounts does not combine budgets.
2. Lock/atomically update one account-period ledger across companies and instances;
   pending reservations plus committed usage must not exceed 100. Transactionally
   commit invoice, usage and audit; unique idempotency/invoice keys; reject invoice
   IDs already owned by another company and conflicting request bodies.
3. Edits/retries of a committed invoice must not consume again, including after a
   billing boundary. Verify ownership BEFORE returning idempotent success. Handle
   lease expiry, abandoned reservations, failed saves, uncertain commit, cancellation,
   deletion/refund rules and concurrent upgrades without lost slots or double count.
4. Periods come from verified subscription state, with clear timezone/anniversary
   boundaries. No destructive monthly reset. Decide draft counting and historical
   imports explicitly. New IDs cannot be allowed to bypass exhausted allowance.
5. Rate store must atomically consume all distinct trusted user/account/IP buckets
   using shared time across workers; duplicate-key validation is only one safeguard.
   Handle store outages by failing closed. Check every expensive/upload/API entry
   point; bound bytes/pages/concurrency. No in-memory per-process fallback.
6. Key IPs only from reviewed reverse-proxy trust. Review-only nginx rules are NOT
   attached to Compose/application, do not replace business quotas/authentication,
   and have provisional thresholds. Test 429/Retry-After, redistributions across
   companies, concurrent last-slot requests and spoofed/rotated IPs with real storage.

Injected test doubles prove contract handling, not PostgreSQL atomicity/RLS or a
production distributed limiter. No database connection, reservation or migration
was performed. Optional customer fields/local subscription preferences are not yet
supported by a reviewed live API/database schema.

## Release readiness and next dependencies

| Category | Status |
|---|---|
| Local frontend functions | Implemented; final validation results recorded in inventory. |
| VAT arithmetic/classification | Existing money and VAT calculation modules preserved; tests cover sales values and classifications. No historical records rewritten. |
| Docker/CI configuration | Reviewed source, locally parsed YAML only; no Docker or Actions execution. |
| Identity/tenant access | Firebase retained as approved identity direction, but no real verifier/session/bootstrap/capability enforcement integration. Client company scoping is not security. |
| Business data/originals | Browser localStorage and session blobs only; no shared PostgreSQL persistence, private object storage or restore proof. |
| Subscription/renewal/autopay | Local previews only. Billing account model, plan/period authority, provider/card/Direct Debit mandates, verified webhooks, email service/job queue and consent/cancellation/refund rules needed. |
| Abuse prevention | Fail-closed contract improvements only. No live limiter or invoice quota. |
| Dependency safety | 8 package findings unresolved; reachable XLSX parsing is a release blocker. |

Owner approvals/dependencies: reviewed exact dependency remediation/source and lint
packages; Firebase/server identity and synthetic PostgreSQL work; customer/billing
schema and role matrix; private storage provider/region/retention/restore; account
billing and usage semantics; payment and email providers; pinned container base and
Docker validation environment; Git/hosting/registry/protected CI/CD setup. No live
provider credentials should be sent in chat. Do not deploy this as production-ready.

## Final validation and preview

- `npm run typecheck`: passed.
- `npm test`: **73 passed, zero failed**. Includes customer persistence/company
  scoping, sales duplicate separation, customer snapshot/XLSX retention, exact VAT
  classification/value preservation, period/expiry previews and contract hardening.
- `npm run build`: passed; 43 static pages plus existing/new dynamic routes.
- `node tests/browser-invoices.cjs --release-frontend-only`: passed customer create/
  rename/history, sales draft/reload/confirmation, direction filter, local renewal/
  autopay persistence, supplier/document 12/12/1 pages and filter resets. New screens
  checked at 320/390/768/1440 widths; no uncaught page exceptions.
- Existing full browser suite `--stage2 --stage3 --milestone1 --milestone2 --frontend
  --frontend-batch2`: passed actual PDF/PNG/JPG/JPEG extraction, corrupt/encrypted
  handling, retry/stale upload prevention, manual/draft/confirmed editing, single-
  invoice and filtered XLSX/PDF, document recovery, team/settings, company/supplier
  and banking allocation/reversal workflows. Keyboard drawer/dialog/validation focus,
  guarded navigation, live pagination announcements and 320/390/768/1024/1440 layouts
  passed. Existing POS regression exercised without developing ORS.
- Existing browser suites now use the neutral Invoices register title. New test data
  is explicit, synthetic and confined to fresh temporary profiles. No owner browser
  records were inspected, exported or overwritten. Existing synthetic preview images
  in docs/previews were refreshed; prior versions are recoverable from this snapshot.
- YAML parsed successfully using existing PyYAML. Docker/Actions were NOT executed;
  full WCAG 2.2 AA conformance, screen-reader testing and a penetration test are NOT
  claimed. Dependency audit remains 6 high/2 moderate; no lint pass claimed.

Preview locally using the existing `npm run dev`, then `/app/customers`,
`/app/invoices`, `/app/documents`, `/app/suppliers` and `/app/subscription`.
Empty workspaces require creating your company first. Existing preview preferences
are browser-local and do not configure real services.

Full paths, hashes and recoverable originals:
`docs/frontend-release-change-inventory.json`. Restore only reviewed changed files
if a later rollback is needed; do not reset browser data or overwrite the immutable
backup. Inventory includes generated synthetic previews separately by path.

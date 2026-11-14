# Local customer and platform administration acceptance

Status: substantial implementation delivered; **full local acceptance is not complete**. Migration 043 and initial administrator provisioning remain unapproved and unapplied to the live development database. No VPS, SSH, production, DNS, Nginx, installation or deployment operation was performed.

## Implemented

The dedicated `/super-admin` application has all 15 requested navigation modules, real PostgreSQL projections, responsive navigation, global search, directory filters, pagination, loading/empty/error states and confirmations. VAT remains green; ORS retains its orange shopping interface.

Platform grants are separate from company roles. Super Admin, Billing Admin, Support Agent, Sales Agent and Read-only Auditor permissions are enforced in SQL on each operation. Recent session-bound MFA is mandatory; enrollment confirms the current password. RFC 6238 SHA256 codes have replay prevention, database lockout and a 15-minute session window. The migration creates no administrator, password, customer, plan, receipt or session.

User/company directories include restricted profiles, memberships, subscriptions and usage. User suspension revokes sessions; company suspension preserves records. Grant changes expire the target's MFA verification. Self-revocation and casual suspension of another administrator are refused.

Plan creation, editing and archiving persist in PostgreSQL. Assignments snapshot prices and quotas into contracts and the existing entitlement model. Renewals apply scheduled plans, issue unique period invoices and preserve immutable billing events. Customers can view effective plan/status, usage, invoices, recorded payments and history, and submit idempotent change/cancellation requests. Billing staff can acknowledge/close those requests. Three-day payment grace, expiry and cancellation restrict writes in SQL while preserving authorized reads/exports. Existing trials retain their original boundaries and history. Document OCR quotas are checked at reservation time across the billing account.

Manual receipts require independently verified external references, currency matching and an amount within the remaining balance. This does not collect money or claim provider success. Existing Stripe test checkout is refused for manually managed contracts. Reports distinguish service-period accrual, recorded collections and active-contract monthly run rate by currency. These metrics exclude tax and are not statutory accounts.

CRM uses the actual website's `contact_intake.enquiries`: contact identity, company, category, source, qualification stage, assignment, notes, reminders, existing-company conversion links and immutable change timeline. Existing contact idempotency/deduplication is preserved. The unrelated legacy lead administration endpoint is retired rather than performing a non-atomic cross-database authorization check.

Support adds assignment, priority, escalation, customer-visible conversations, administrator-only notes and resolve/reopen actions. The migration removes the old administrator shortcut into arbitrary company support scopes. In-app notifications are readable/acknowledgeable only by their recipient. Settings use a narrow non-secret allowlist. Privileged reads and writes are audited; audit records, notes, billing invoices, receipts and billing events are append-only.

## Acceptance matrix

| Area | Result | Evidence / limit |
|---|---|---|
| Full automated suite | 432 passed, 0 failed, 1 skipped; 433 total | `.platform-unit-tests.log`; Windows does not permit the symlink-creation case |
| TypeScript | Passed | `.platform-typecheck.log`; guarded build also checks types separately |
| Project lint | Passed | `.platform-lint.log`; the existing script scans JavaScript/CJS/MJS |
| Production Next.js build | Passed | `.platform-build.log`; no migration execution |
| Platform PostgreSQL + Chrome | 54 passed, 0 failed | `.deployment-review/platform-admin-postgres.json`; includes 18 browser checks and 36 database/security checks |
| First-time MFA | Passed | Incorrect-password rejection, enrollment, authenticator URI, verification, secret removed from UI |
| Admin desktop/tablet/mobile | Passed | Actual component/CSS at 1440, 768 and 390px; screenshots in `.deployment-review/platform-admin-*.png` |
| Admin authorization | Passed | Forced RLS, runtime secret/table denial, role denials, session binding, MFA replay/lockout/expiry, grant revocation, no tenant support shortcut |
| Subscription and quota enforcement | Passed | Custom snapshot, currency/overpayment denial, scheduled renewal, cancellation, ownership, immutable receipts, database OCR limit and forged timestamp rejection |
| Provisioning and containment SQL | Passed in disposable database | Repeat provisioning refused; containment preserves financial/audit rows |
| VAT/customer authenticated Chrome | Passed | `.platform-customer-browser.log`: contacts, draft redirect, confirmation, exact reports/XLSX, support, routing, duplicate originals, legacy admin MFA gate, 1440/390px |
| ORS PostgreSQL | 7 passed | `.launch-acceptance/marketplace-postgres.json`; synthetic supplier/product records |
| ORS authenticated Chrome | 5 passed | `.launch-acceptance/marketplace-live-browser.json`; real local app/API/PostgreSQL, two suppliers, cart persistence and pending drafts; zero WhatsApp requests |
| ORS component Chrome | 17 passed | `.platform-ors-browser-grid.log`; synthetic HTTP boundary, actual component/CSS, inline comparisons, packs/VAT, quantities, invalid phones and message encoding |
| Real OCR integration | Passed for new PDF and PNG | `.deployment-review/sprint-ocr-postgres.json`; real ClamAV/Tesseract, private originals, duplicate, correction, tenant denial; confirmed net 35.00 / VAT 6.00 / gross 41.00 |
| Full native file acceptance | Passed | Text/scanned PDF, PNG, JPEG, WebP; EICAR detected and blocked; corrupt PDF blocked |
| Historical OCR queue protection | Passed | Fence `2026-10-30T16:50:33.492Z` preserved; pre-fence queue hashes identical; no global queue claims |
| Source database safety | Passed | New admin rehearsal uses a schema-only restore plus synthetic records, reproduces source database ACLs, and verifies source schema/jobs unchanged; disposable database removed afterward |
| Full Next.js admin lifecycle | Pending approval | Admin browser tests use actual services and disposable PostgreSQL through a test HTTP adapter. They do not replace post-activation proxy/route/session acceptance in Next.js |

## Remaining blockers and unfinished requirements

1. Live development schema activation and the separately named initial administrator require explicit approval. The new admin interface currently shows the guarded unavailable state; it has no default credentials or bypass.
2. The existing automatic WSL document supervisor times out connecting to its protected database endpoint. Targeted synthetic processing works through the existing processor bridge. No database listener, firewall, protected credential file or queue supervisor was changed. Automatic background OCR is not accepted as working.
3. Support attachment upload/sharing is not implemented. Existing invoice originals remain private; no platform-wide document browsing endpoint was added.
4. Renewal reconciliation/reminders currently require an explicit administrator **Reconcile** action. An automatic scheduler is not implemented or started.
5. Advanced cohort/churn analytics, billing credits/refunds, comprehensive admin exports and richer service/date/assignee filtering remain unfinished. Existing invoice VAT reports/exports passed.
6. Existing separately pending migrations, including 032/033/036/041/042, remain independent approval gates. The current runtime inventory reports draft soft-delete and account-profile update unavailable. Their SQL files are not treated as approval.
7. A private pre-change backup and a complete data restore verification must precede approved live schema execution. This turn's new admin rehearsal restores schema only; it does not claim a fresh complete source-data restore.

## Migration review package

All three files are unapproved and have only been exercised in disposable databases.

| Exact file | SHA-256 |
|---|---|
| `database/migrations/saas/043_platform_administration.review.sql` | `0c1d019fad98ca9252d9ffa25909de0dbf6740f426c5a9afbb2311ca04a323bc` |
| `database/migrations/saas/043_platform_administration.initial-admin.review.sql` | `6f136a26bf4d1d54064db328d409467427278293c92e270e49a397ceaceb7f66` |
| `database/migrations/saas/043_platform_administration.rollback.review.sql` | `37707f7e19e4fa689a096f908eb7674b4f5b28318cc36f27031bfd0264de2ecc` |

Migration 043 is target-guarded for the existing local PostgreSQL 17 installation, transactional and bounded by lock/statement timeouts. It creates the platform schema, adds the optional entitlement plan reference, preserves the original fixed-plan checks for existing rows, adds custom-contract snapshot checks, extends tenant authorization with time-based contract gates and restricts legacy support authorization. It does not update existing customer, invoice, trial, purpose, job or financial rows.

Initial provisioning requires a separately approved existing active, verified user UUID and a written approval reference. Only the guarded local operator can run the review SQL. It refuses an existing active Super Admin. It creates no password/session and requires MFA enrollment before platform access. No email-based, first-user or startup promotion exists.

Rollback: disable `PLATFORM_ADMIN_ENABLED` first. The separately reviewed containment SQL revokes runtime execution of platform functions and retains forced RLS, contract gates, quotas, custom snapshots and immutable audit/billing history. It does not drop schemas or destroy records. Restoring old entitlement constraints after custom assignments requires a separately reviewed forward repair. No Git repository was found, so a historical application-file rollback artifact is not claimed; preserve an application snapshot before activation.

## Local test instructions

From PowerShell in `D:\vetthevat`:

```powershell
npm run platform:review
npm run test:platform:pg
npm run test:browser:platform
node scripts/local-sprint-acceptance.cjs
```

The acceptance server uses the existing guarded local database, private originals and HTTPS certificate. It executes no migration and starts no queue consumers or email delivery. If the server is already running, reuse it.

- Login: `https://localhost:3444/login`
- VAT: `https://localhost:3444/app/dashboard`
- ORS shopping: `https://localhost:3444/app/ors/shop`
- ORS cart: `https://localhost:3444/app/ors/cart`
- ORS order history: `https://localhost:3444/app/ors/shopping-orders`
- Subscription/account requests: `https://localhost:3444/app/subscription`
- Super Admin: `https://localhost:3444/super-admin` — guarded until migration and provisioning approval.

After approval, backup/restore validation and exact reviewed SQL execution, activation additionally requires `PLATFORM_ADMIN_ENABLED=1` and `PLATFORM_ADMIN_SCHEMA_SHA256` equal to the reviewed migration hash. Environment flags do not constitute approval or run SQL. Post-activation acceptance must sign in through Next.js, enroll MFA with the selected account, exercise each permitted role and recheck customer tenant isolation.

The exact changed source-file list and file hashes are recorded in `.deployment-review/local-platform-acceptance.json`. This is a local implementation review, not a production readiness recommendation.

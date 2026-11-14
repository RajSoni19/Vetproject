# ServerVerse launch sprint — 7 November 2026

**Recommendation: NO-GO for production.** Safe local implementation and testing were completed as recorded below. No SSH was attempted; Inovetaa and all VPS services, packages, Nginx, DNS, databases and public access were untouched. No live development or production migration was executed.

## 1. Local implementation completed

- Reused the existing deployment package and added same-host `all` release/rollback mode, so web/workers can activate one artifact together. Database migrations/restores remain outside application release/rollback.
- Prepared a guarded, dedicated PostgreSQL 17 service/configuration, local TLS-only HBA, administrator peer map, bounded pools/resource settings and transactional role template. Runtime roles stay least-privilege and NOBYPASSRLS; only the isolated backup role has BYPASSRLS.
- Implemented an explicitly approved private-files backend for ServerVerse using the existing atomic, immutable, digest-checked byte store. Added web-owned/setgid originals permissions and read-only worker/backup access. It remains disabled until audited Linux ownership and exact installation approval match. R2 remains available as a separate alternative.
- Made document workers validate the activation fence before claiming. Local processing preserves exactly `2026-10-30T16:50:33.492Z`. ServerVerse workers require a separately approved, database-matched production activation timestamp.
- Added immutable original/asset archives, checksum-verified fresh-directory recovery, originals inclusion after the DB snapshot, and encrypted offsite archive/checksum upload verification. No production backup or deletion occurred.
- Added read-only structured monitoring and inactive service/timer templates for app/DB/storage, disk, worker heartbeat, scanner/signature age, backups and restore age. Added a fail-closed capacity/port gate.
- Added explicit Nginx mTLS/origin-TLS rendering choices, custom internal app ports, an offline hashed source/bootstrap review package and exact verified-access/audit-account instructions. Every migration and deployment approval remains false.
- Finished the Migration 041 disposable rehearsal, with pinned 042 correction, added full source-unchanged verification, and retained source purpose-history fingerprints. Both live migrations remain unapplied.
- Updated stale browser expectations for current localized labels, currency/date presentation and the separate Purpose dialog. Narrowed the live ORS browser's local-certificate exception to its pinned public-key fingerprint.

## 2. Tests and evidence

Machine-readable evidence: [serververse-sprint-evidence.json](../.deployment-review/serververse-sprint-evidence.json).

| Check | Observed result | Limit |
| --- | --- | --- |
| Full automated Node suite | 426 passed, 0 failed, 1 skipped; 427 total | Local tests; not production infrastructure acceptance |
| Final TypeScript and production Next.js build | Passed | Windows build; not a Linux-native release artifact |
| Isolated worker compilation | Passed | Consumers were not started |
| 041/042 disposable PostgreSQL rehearsal | Passed; source ACL/catalog/data comparison, tenant denial, idempotency, append-only audit and unchanged purposes | 041 alone reproduced the selection-RLS defect; 042 was applied only in the disposable database; source unchanged; disposable dropped |
| Real PostgreSQL ORS API | 7 checks passed; two persistent pending supplier drafts | Synthetic companies/products/offers; no supplier message sent |
| Authenticated live ORS Chrome | 5 checks passed | Real local API/PostgreSQL; zero WhatsApp requests |
| Shopping Chrome fixture | 17 passed, 0 failed, desktop/mobile | Synthetic HTTP; complements the live checks |
| Authenticated VAT/report/browser workflow | Passed, 1440px and 390px | Contact edit, invoice confirmation, exact report/XLSX download, tenant/admin denial, duplicate upload and purpose persistence |
| Real native processing | Text PDF, scanned PDF, PNG, JPEG and WebP passed; EICAR and corrupt PDF blocked | Existing local ClamAV/Tesseract; no global queue claim |
| New-upload OCR/PostgreSQL integration | PDF/PNG passed intake, native scan/OCR, extraction persistence, digest retrieval, duplicate detection, foreign-company denial, explicit manual correction and VAT confirmation | Fixture-specific leases only; no global queue claim |
| Corrected confirmed invoices | £35.00 net, £6.00 VAT, £41.00 gross for both synthetic files | Clean originals attached; OCR never auto-confirmed financial records |
| Legacy queue preservation | Before/after SHA-256 identical: `3679f2f99954300a513225067dd06dcf6d11600929ccbc1812aa56a19b3523f5` | Fence remains `2026-10-30T16:50:33.492Z` |
| Linux private-file recovery | 3 tests passed | Temporary synthetic files; roundtrip, tamper/traversal/link rejection, no overwrite; no offsite encryption claim |
| Linux immutable storage | 4 tests passed, zero skipped | Includes real filesystem symlink-escape denial, atomic writes, integrity and preservation of source files |
| Deployment safety | 23 targeted tests passed; 9 Bash and 3 Python files passed syntax; same-host orchestration passed with mocked service/probe commands; PG17 parsed role template | Zero actual service actions; real Nginx/systemd acceptance still pending |

Raw evidence remains in `.sprint-041-rehearsal.log`, `.sprint-tests.log`, `.sprint-build-final.log`, `.sprint-deployment-tests.log`, `.sprint-native-acceptance.log`, `.sprint-ors-api.log`, `.sprint-vat-api.log`, `.sprint-browser.log`, `.sprint-ors-browser.log`, `.sprint-shopping-browser.log`, `.deployment-review/sprint-ocr-postgres.json`, `.launch-acceptance/release-browser.json`, `.launch-acceptance/marketplace-live-browser.json` and `docs/test-results/ors-shopping-browser.json`.

The OCR integration assigned leases only to its own newly created synthetic records and invoked the real worker completion functions. It did not call a global claim function or start a queue-draining loop. This is explicitly different from production supervisor/crash-recovery acceptance, which remains gated.

## 3. ServerVerse compatibility status

**Prepared locally, not verified on the VPS.** Production templates use self-hosted PostgreSQL 17 on verified-TLS loopback and separate same-VPS service identities. Neon remains an explicit alternative/staging branch, not a production fallback. Cloudflare AOP is no longer an implicit requirement of every rendered origin-TLS configuration. Default mTLS security is preserved unless an explicit reviewed variant is chosen.

The hashed offline review package is [serververse-reviewed-2026-11-07](../.deployment-review/serververse-reviewed-2026-11-07-v2/bootstrap-plan.json). It inventories 42 forward migration sources and documents corrected/superseded migration choices. It does not execute or approve SQL. Source scripts still need individually reviewed production target/installation rebasing and fresh empty-target rehearsal; this package does not pretend that a development SQL file is a production migration.

Current resource budgets require 14,464 MiB of **VTV-exclusive spare memory**, four available vCPUs and at least 30 GiB free disk plus data/backup growth. Actual ServerVerse capacity is unknown. The local WSL test host is not a VPS capacity measurement. Malware scanning must not be disabled to fit.

## 4. Outstanding launch blockers

1. No verified VPS identity/access/audit or protected-site baseline; OS, ports and spare capacity remain unknown.
2. No approved production-rebased empty bootstrap/migration SQL or tested least-privilege recovery grants/COPY-under-RLS. Live 036 supplier-line review, 041 initializer and 042 correction remain unapplied. ORS supplier-invoice review persistence therefore remains blocked on the live local schema; generic upload/OCR/manual VAT confirmation and shopping draft ordering were tested separately.
3. No exact pinned Node 22.23.4 Linux x64 release artifact or real Nginx/systemd runtime acceptance. Local WSL has Node 22.15.1; Nginx, ShellCheck, age and rclone are not installed there. No packages were installed to conceal these gaps. The official pinned-runtime tarball/signature/hash still requires verification through the existing guarded installer workflow.
4. Production origin TLS/Cloudflare topology, private storage configuration/ownership, SMTP sender/delivery, applicable billing/provider acceptance and secrets are unverified.
5. No actual encrypted offsite backup and independent production-shaped recovery/PITR, worker crash/restart acceptance, signature updater ownership or alert destination/delivery evidence.
6. Exact-hash release, production SQL and public/DNS enablement approvals are absent. All acceptance booleans remain false.

## 5. Exact proposed VPS changes

The conditional, VTV-only sequence is in [serververse-launch-plan.md](../deploy/serververse-launch-plan.md). It proposes new `vtv-*-production` identities, VTV-exclusive release/config/state/originals/PostgreSQL paths, a new loopback database and app port, VTV-only services/monitor/backup units and a VTV-named TLS vhost. No existing user, process, PM2 configuration, site, database or global runtime is to be replaced or stopped. Actual ports, TLS mode, package diffs and concrete host-bound SQL cannot be approved until the audit establishes them.

Instructions for identifying the VPS IP through its provider panel, independently verifying its SSH public-host-key fingerprint in the provider console, creating a later approved forced-command audit account and running the read-only inventory are in [serververse-access.md](../deploy/serververse-access.md). No SSH connection has been attempted.

## 6. Rollback and backup readiness

Application-only release/rollback tools are prepared and their same-host orchestration is locally tested with mocks. They never restore schemas, files or audit history. The original PostgreSQL archive's restore equivalence was verified in a disposable database, including source ACLs and constraints. Private-file recovery passed real POSIX roundtrip and safety tests.

Production age/offsite upload, non-superuser restore privilege design and independent fresh-target recovery remain required before backup readiness can be signed off. A daily logical dump is not PITR. Recovery keys stay off the VPS; no destructive retention cleanup is automated. No production database is to be overwritten during a restore test or application rollback.

## 7. GO/NO-GO

**NO-GO.** Local evidence is substantially stronger and the safe implementation is reviewable. Remote identity/capacity, production SQL, exact Linux artifact, provider/secret setup, recovery and explicit deployment/public-access gates still prevent a production-ready claim.

The local PostgreSQL cluster was started through its existing lifecycle guard for these tests and remains available locally. Synthetic diagnostic records remain local. No protected development schema migration was run. No email or supplier WhatsApp message was sent. The temporary native processors and the task-owned acceptance web server exited; no general document consumer was launched.

## Main source changes

- Application: `lib/server/saas/{local-originals,serververse-originals,storage-runtime,worker-store,document-runtime}.ts`, `lib/server/deployment-health.ts`.
- Rehearsal/review: `scripts/rehearse-module-review-initializer.cjs`, `scripts/deployment/{render,prepare-serververse,serververse-capacity,collect-sprint-evidence}.cjs`, `scripts/local-sprint-acceptance.cjs`, `scripts/release-readiness.cjs`.
- Deployment: VTV PostgreSQL/web/backup/monitor units, role/PostgreSQL/HBA/peer-map/host-audit templates, production web/inspect/extract/backup/monitor env templates, `deploy/ubuntu/{bootstrap-host,release,rollback,backup}.sh`, `smoke.cjs`, `monitor.cjs`, `private-files.py`, access/launch/readiness documentation.
- Tests: `serververse-sprint.test.cjs`, POSIX private-file and Linux syntax/orchestration checks, targeted native OCR/PostgreSQL bridge/integration, and updated authenticated browser workflows.

No development/production migration SQL file was modified or executed on the live database. SQL changes in this sprint are preparation templates; migrations 036/041/042 were only inspected/hashed, with 041/042 rehearsed in the disposable database.

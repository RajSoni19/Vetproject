# Milestone 3B.1 / 3B.2 implementation results

Completed local code and test work on 15 October 2026. This is backend foundation
work, not a production-connected backend. No PostgreSQL connection or SQL execution
was performed, and no Firebase SDK, project, production service or Flutter source
was accessed. ORS, deployment and live-data migration remain out of scope.

## Baseline and recoverability

Read AGENTS.md, installed Next 16.4 Route Handler/data-security guides, architecture
discovery, integration/migration plans and Milestone 1/2 results; inspected domain,
editor, local persistence, API contracts, original SQL, dependencies and tests.
Git status reports no Git repository. No Git initialization, staging or remote was
performed. Recoverable originals are under `.recovery/milestone-3b12-20261015-064510`
and a fresh foundation snapshot `.recovery/milestone-3b-foundation-20261015-232716`.
The immutable `D:\vetthevat-backup` was not modified. Browser regression tests used
new synthetic profiles, never the owner's browser-local records. No records were
exported, reset, migrated or discarded.

## Delivered implementation

| Area | Files / actual behaviour |
| --- | --- |
| Classification repair | `lib/vat-calculations.ts` preserves optional explicit taxClassification through calculateLine, including numeric InvoiceEditor edits. Missing classification stays absent; intentional changes still work. VAT arithmetic, rounding policy and historical records are unchanged. |
| Private configuration | `lib/server/config.ts`, `config-validation.ts`, `.env.example`: lazy server-only environment access, required values, loopback-only dev/test target separation, approved production target/TLS, bounded settings and local demo Firebase emulator policy. Public backend-secret variable names/values are rejected. Actual environment files were not created/configured. `.gitignore` now excludes all .env variants except the placeholder template. |
| Driver | Only approved direct dependencies `pg@8.16.3` and `@types/pg@8.15.5` installed with exact pins and install scripts disabled. Lockfile review showed only these and their transitive package entries added, with no existing unrelated package upgrades. Firebase/ORM/migration/lint packages were not installed. |
| PostgreSQL adapter | `lib/server/database.ts`: server-only, lazy bounded pool, explicit host/user/database/password, connect/query/statement/idle/idle-transaction timeouts, verified TLS when enabled and pool-local NUMERIC/BIGINT string parsers. No import-time connection or current application consumer. |
| Safe transactions | `lib/server/database-core.ts`: one checked-out client, runtime identity/role/target preflight, BEGIN/COMMIT/ROLLBACK, guaranteed release, damaged/timeout/uncertain-commit discard, redacted typed errors and no automatic retry. Prevents concurrent/unawaited pending queries and caught query errors from publishing false success. The SQL interface accepts trusted server DAL code, not arbitrary user SQL. |
| API foundations | `lib/server/api-v1.ts`: strict structural validators, exact decimal strings, optional classifications, JSON byte limits, UUIDs, bounded pagination, version/idempotency header requirements, same-origin helper and no-store response/error envelopes with server request IDs. No live business route, persistence, idempotency store or successful request is fabricated. |
| Identity preparation | `lib/server/identity.ts`: explicit real-verifier interface plus project/expiry/revocation and active company capability checks. No default verifier, fake identity or permissions. `docs/milestone-3b-firebase-prerequisites.md` records Firebase/web-session/mobile compatibility decisions. |
| Migration drafts | `database/drafts/001_vat_core.review.sql`, `002_read_isolation.review.sql`, README: alternative baseline for drafts, decimal precision, optional classifications/direction, snapshots/revisions, company-qualified links, supplier aliases, private originals/checksums/missing states, banking imports/allocations/reversals, audit, legacy mappings and idempotency. Read-isolation policies use membership context; writes are deny-by-default. Original `database/001_initial_schema.sql` remains unchanged. No migration runner or grants were introduced. |

The API/DB foundations are deliberately not wired to the local frontend. Existing
invoice/OCR/VAT/report/export/UI workflows continue to use labelled local state.
Server identity, tenancy, durable original storage and shared persistence have not
been proven against real services. Do not call this production-ready.

## Verification

- `npm run typecheck`: passed on final source.
- `npm test`: **51 passed, 0 failed**, including the existing financial/report/
  banking suites and new classification, configuration, transaction, API and
  identity-port tests. Database transports/verifiers are injected doubles. The
  actual pool factory is tested with an injected transport without connecting.
- `npm run build`: production compilation passed (Next 16.4; 42 static pages).
- `node tests/browser-invoices.cjs --classification-only`: passed actual edits,
  draft save/reload, intentional reclassification and XLSX download inspection.
- `node tests/browser-invoices.cjs --stage2 --stage3 --milestone1 --milestone2`:
  passed digital/scanned PDF and PNG/JPG/JPEG extraction, retry/corrupt/encrypted/
  oversized documents, stale selection, manual/draft/confirmation, filtered XLSX/
  PDF exports, document checksum recovery, supplier/company journeys and banking
  partial/split/reversal flows. No uncaught page exceptions. Existing POS regression
  was exercised without developing POS/ORS features.
- Browser checks passed 320/390/768/1024/1440 widths, keyboard drawer/modal focus,
  validation focus and unsaved navigation protection. Synthetic screenshots were
  refreshed in `docs/previews/milestone-1` and `docs/previews/milestone-2`.
- `npm run lint`: existing script fails because Next 16 has no `next lint` command;
  ESLint is not installed. No lint pass is claimed and no extra dependency added.
- Initial sandboxed npm install failed on cache-only networking; approved installs
  succeeded with network access. Initial sandboxed Node tests failed on subprocess
  EPERM; rerunning with subprocess access succeeded. A new test-loader unsupported
  parameter-property syntax issue was corrected before the final green suite.

## Remaining approvals and security gates

1. Explicit authorization for the first isolated local database connection and
   synthetic integration tests; administrator-only cluster identity verification,
   approved dev/test roles, revoked PUBLIC CREATE/TEMP/opposite-environment CONNECT.
   Preflight SQL and draft RLS have not been executed or proven on PostgreSQL.
2. Review/approve schema, role/capability matrix, privileged identity bootstrap,
   write policies, migration ownership/tooling and backup/restore tests before SQL.
   Candidate schema is not an ALTER migration for an unknown deployed database.
3. Approve an exact Firebase Admin SDK version before a separate install and approve
   project access, emulator setup, server credentials and web session/CSRF strategy.
   No additional dependency is required to retain the foundations delivered here.
4. Select/approve private storage provider/region/retention/versioning/malware and
   backup policies. No provider credentials or paid resources configured.
5. Add real API commands with complete financial/date/status validation, versioned
   writes, atomic idempotency/audit, concurrency and cross-company tests. Structural
   validators and proposed RLS alone do not enforce business rules or authentication.
6. Explicit browser-data import approval with encrypted raw backups, ownership
   mapping and per-company/currency count/line/net/VAT/gross/checksum reconciliation.
   Missing session-only originals must remain explicitly missing until recovered.

See `docs/api-v1-foundation.md` for integration boundaries and the JSON change
inventory for paths, hashes and recoverable originals. No further milestone starts
automatically.

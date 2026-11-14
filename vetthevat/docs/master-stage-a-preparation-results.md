> Final status: Stage A isolated database/authentication/authorization integration is complete. See [completion report](master-stage-a-completion-results.md). The preparation details below are historical; the actual user-approved cluster path is `D:\vetthevat.saas-dev\cluster`. Approved migrations 001 and corrective 002 are committed.

# Stage A preparation results — 23 October 2026

**Preparation is ready for migration review. Stage A is not complete:** no new
database has been initialized and its actual PostgreSQL integration tests have
not run. Financial APIs remain disabled. No existing database records, production
services, Flutter/mobile data or immutable backup were changed.

## Code prepared

- Separate guarded migration/initializer with exact target and SQL checksum,
  restricted service roles, normalized permissions, session-owned company
  selection, company/account foundations and forced RLS.
- Request wrapper for verified PostgreSQL session, same-origin/CSRF protection,
  rate limiting and server-selected capability. The database repeats live
  membership/permission checks while holding authorization row locks.
- Scoped transaction implementation verifies database/role/installation, binds
  session hashes and tenant context transaction-locally, rejects pending/parallel
  or swallowed failed queries, requires an acknowledged COMMIT and never retries
  an uncertain operation automatically.
- Services reject mixed authentication/business databases. The new instance uses
  the existing PostgreSQL identity code against its own fresh identity tables,
  never copied users or an email-based association with the existing test DB.
- Versioned private S3-compatible original-storage adapter using explicit
  isolated credentials, immutable keys, private bucket checks, conditional writes,
  bounded reads and digest/version verification. It creates no storage service.
- Durable document reservation, idempotency, original preservation, quarantined
  upload and queued inspection contracts. No trusted scanner is installed;
  quarantined originals cannot be downloaded or treated as clean. Downloads
  require a matching clean inspection and recheck authorization after object I/O.

These services are not mounted by a financial route. This does not enable invoice,
banking or ORS persistence, company provisioning or subscription activation.
Later stage migrations will add their business-record schemas and commands.

## Verification and limits

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Existing + new automated suite | 177 passed, zero failed |
| New Stage A tests | 16 passed; injected SQL/S3 transports and actual SDK command construction |
| Migration syntax | Parsed offline with PostgreSQL 17 grammar, including SQL-language function bodies |
| Production build | `npm run saas:build` passed; backend/provider flags disabled |
| Production dependency audit | Zero findings |
| Full dependency audit | Five existing high findings in the Tailwind 3 development dependency chain |
| New PostgreSQL integration tests | Not run: migration not approved/executed |
| Actual private-object provider/scan | Not configured or verified |
| Browser regressions | Not rerun for this preparation; no frontend screens changed |

Two default 11-worker build attempts compiled but failed during page-data
collection with Windows exit `3221226505`. The successful local Stage A build uses
an explicit `VETTHEVAT_BUILD_SINGLE_WORKER=1` option supported by the installed
Next build configuration. Unset preserves default deployment behavior. This is a
verified workaround, not a claimed diagnosis of the native worker crash.

The tests cover wrong target/role/fingerprint, forged session/role selectors,
CSRF/origin rejection, permission separation, rollback and uncertain COMMIT,
closed/pending/parallel transactions, SQL parameter binding, storage privacy /
version checks, corrupt/oversized object reads, document retry after storage
failure, stable original identity, idempotent replay, quarantine denial and the
absence of enabled financial routes. These are not live PostgreSQL RLS/race tests.
The SQL parser does not verify privileges, catalog resolution, PL/pgSQL execution,
locking semantics or policies. Those must be verified after approval.

## Exact database approval details

1. **Host and port:** `127.0.0.1:55440`, new PostgreSQL 17 cluster bound to loopback.
2. **Database:** `vtv_saas_dev`, under `D:\vetthevat\.saas-dev\cluster`.
3. **Ownership/roles:** database owner `vtv_saas_database_owner` (NOLOGIN);
   schema owners `vtv_web_owner` and `vtv_saas_owner` (NOLOGIN). Restricted
   application roles are `vtv_web_runtime` and `vtv_saas_runtime`. The new-cluster
   operator `vtv_saas_operator` is used only for initialization/backup, never by
   the application.
4. **Migration:** `database/migrations/saas/001_saas_foundation.review.sql`.
   SHA-256: `d70e4e20c828e2e91349f8a6fce450c330716b16493c9868e023cf25c911d366`.
   Exact operator pre-DDL and guards are reviewable in
   `scripts/saas-dev-migration.cjs`. Nothing runs on import/build/start.
5. **Objects:** 28 new tables: 13 identity/security tables and 15 SaaS foundation
   tables; 10 explicit indexes plus PK/UNIQUE indexes; foreign-key/unique/check
   constraints; 15 explicit runtime policies and 11 owner-only lookup policies.
   Eleven tenant tables enable and force RLS. The complete table definitions,
   constraints, named indexes, policy expressions, security definers and immutable
   history triggers are listed in `database/migrations/saas/stage-a.catalog.json`
   and the adjacent README. Seed rows are schema stamps and role/permission
   definitions, not accounts, companies, paid entitlements or financial records.
6. **Existing records:** none will change. The existing auth target
   `127.0.0.1:55439/vtv_web_auth_test` is excluded, including its existing users,
   sessions, memberships and audit records. Earlier read-only inspection captured
   only catalog metadata and aggregate counts, never credential values.
7. **Backup/rollback:** before SQL, create a custom database backup and private
   role backup with checksums in the new cluster's private directory; validate the
   archive listing. A real restore drill still requires a separately approved
   fresh target. SQL is one transaction. On failure/unknown commit, preserve the
   isolated cluster and recovery files for inspection; no automatic drop, delete,
   overwrite or retry. After commit, approve any forward fix or fresh-target
   restore separately. Application passwords are random service secrets in a
   restricted local file; no real user/admin password is created.
8. **Identity mapping:** fresh-instance session token hash resolves to a verified,
   active PostgreSQL user UUID. Foreign-key company membership uses that UUID.
   No email match, browser role, supplied user UUID or global administrator grant
   can establish membership. No old authentication session is bridged to this DB.
9. **Tenant isolation:** exact database/role/fingerprint checks; live session and
   membership/capability locks; transaction-local context; parameterized selectors;
   forced RLS and least-privilege grants. Company selection is owned by the live
   session. Software administrator grants stay separate from company authority.
   Real cross-company and revocation-race tests are required before API activation.
10. **Mobile/production isolation:** a new local cluster and new credentials,
    no production endpoint/config/DNS changes, no Firebase SDK web flow, no mobile
    import or connection. Flutter, production Firebase, existing PostgreSQL,
    Vercel and `D:\vetthevat-backup` remain untouched.

The new database has **not** been created. No actual administrator, test company,
test financial record, storage bucket or email has been created by this stage.

## Approval request

Approve only initialization of a NEW PostgreSQL 17 cluster at
`D:\vetthevat\.saas-dev\cluster`, listening exclusively on `127.0.0.1:55440`,
creation of database `vtv_saas_dev` with the owners/restricted roles above,
the described pre-migration backups, and application of
`database/migrations/saas/001_saas_foundation.review.sql` with SHA-256
`d70e4e20c828e2e91349f8a6fce450c330716b16493c9868e023cf25c911d366`.

This approval excludes modifying the existing authentication test database,
creating a real administrator, starting a storage/scanner service, sending email,
production credentials/connections, financial API activation, later migrations
and deployment. After migration, actual RLS/authorization/concurrency integration
testing must pass before Stage A can be marked complete.

The pause is explicitly required by your instruction: “Do not execute migrations
yet” and “STOP at the migration approval boundary.” No migration execution is
authorized by the earlier authentication-only database approval.

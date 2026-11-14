# Stage A completion — 23 October 2026

**Stage A COMPLETE for the approved isolated database, authentication, company
authorization and transaction integration scope.** All requested acceptance
checks passed. This does not mean VAT/ORS financial persistence, private-file
services or production deployment are operational. Stage B is planned only.

## Actual connection and migration history

| Item | Verified value |
| --- | --- |
| Cluster | `D:\vetthevat.saas-dev\cluster` — the latest explicitly approved path |
| PostgreSQL | 17.11, `127.0.0.1:55440` only |
| Database | `vtv_saas_dev` |
| Database owner | `vtv_saas_database_owner` — NOLOGIN |
| Schema owners | `vtv_web_owner`, `vtv_saas_owner` — NOLOGIN |
| Restricted application roles | `vtv_web_runtime` for identity; `vtv_saas_runtime` for company services; neither superuser nor RLS bypass/role/database creator |
| Operator | `vtv_saas_operator`, isolated cluster initialization/test/backup only; never an application credential |
| Application | Local Next.js production build served over `https://localhost:3444` |
| Credentials | Random server-only local service secrets in ACL-restricted `D:\vetthevat.saas-dev\runtime.json`; no credentials included here |

The initial target and migration checksum were verified before initialization.
Only a new empty cluster/database was created. SQL 001 committed unchanged, and
the real tests then discovered an owner locking-policy defect. Corrective SQL 002
was separately reviewed and explicitly approved by the user before execution.

| Committed migration | Verified SHA-256 |
| --- | --- |
| `database/migrations/saas/001_saas_foundation.review.sql` | `d70e4e20c828e2e91349f8a6fce450c330716b16493c9868e023cf25c911d366` |
| `database/migrations/saas/002_stage_a_authorization_locks.review.sql` | `082079c74f4788fa5724a30f86a443c46ed0179c8c0329c756a9323a690d80fd` |

Neither committed SQL file was changed or reapplied during finalization. Current
checksums match the approved values. Records comprise the private approved-hash
runtime metadata, committed schema-version/installation rows, the private
`authorization-fix-applied.json` commit marker, public migration manifest and live
catalog verification. There is no separate new database migration-history table;
none was silently introduced outside the approved SQL. The verified public
record is `master-stage-a-live-catalog.json`.

Actual catalog: **28 tables, 6 named roles, 11 FORCE-RLS tables and 28 policies**.
The completion catalog lists all live tables, owners, indexes, constraints, roles
and policy expressions. The preparation catalog remains the original proposal;
the two additional owner locking policies are in corrective 002 and the live
catalog. No financial invoice/order/inventory/banking ledger schema was created.

## Exact verification results

| Check | Final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | **179 passed, 0 failed**; complete unit/domain/injected-adapter suite |
| `npm run saas:build` | Passed, production compilation/typecheck/page generation; local single-worker option |
| `npm run test:saas:pg` | **19 real PostgreSQL/HTTPS scenarios passed, 0 failed** |
| `npm run test:browser:saas` | Passed in real Chrome at **1440 px and 390 px**, including company-context and selection checks |
| Client artifact secret scan | Passed: 60 compiled static client artifacts contain none of the isolated database/CSRF/outbox credentials |
| Migration/backup evidence | Both approved SQL digests and all initial/corrective backup digests verified |
| Existing port 55439 database | Fresh `BEGIN READ ONLY` count comparison passed against the preserved pre-Stage A baseline; cluster stopped again afterward |

The build command explicitly sets `VETTHEVAT_BUILD_SINGLE_WORKER=1`, avoiding the
previous Windows multi-worker crash. Unset preserves default Next build behavior.
The native crash's root cause is not claimed as resolved, and Linux/managed
hosting behavior has not been tested by this local build.

The 179 automated tests are not 179 live-service tests. The distinct real
PostgreSQL/HTTPS scenarios are:

1. Exact new target, migration/backup digests, tables/indexes/constraints/policies,
   ownership and restricted roles.
2. Fresh isolated registration, unverified/wrong-password denial, verified
   opaque-session login and unknown-token rejection.
3. Scoped transaction and live membership authorize only the user's company.
4. Real HTTP company context/selection, session ownership, CSRF and anonymous
   request rejection.
5. Injection selectors rejected; SQL values remain bound parameters.
6. Committed document reservation and forced RLS hide an existing other-company
   document record, including direct record-ID queries.
7. Runtime cannot read identity secrets, claim another user/company, alter
   schemas/RLS, assume owner role or activate entitlements.
8. Approved owner policy permits row locking but denies actual owner UPDATE writes.
9. Runtime cannot promote quarantined content or forge a clean inspection.
10. Explicit rollback and a caught SQL failure cannot publish false success or
    persist an audit event.
11. A session cannot read/overwrite another session's company selection.
12. Suspended membership and reduced role deny the next request.
13. Finance, Procurement, Inventory and Viewer permissions resolve differently
    through actual database role/permission records.
14. An in-flight transaction holds authorization locks; a concurrent permission
    change waits, then the next protected request is denied.
15. Six concurrent same-session selections commit without duplicate rows.
16. Selection audit persists; audit deletion and authentication-role access to
    business tables/administrator grants are denied.
17. Initializer refuses existing state before connecting/executing migration SQL;
    existing catalog/data remain unchanged. No committed migration was repeated
    in this final run.
18. Actual isolated PostgreSQL process stop/start preserves identity, session,
    company selection and audit; the application reconnects successfully.
19. Logout durably revokes access; private route redirects and unauthorized admin /
    disabled financial API rejection remain effective; no real administrator or
    software administrator grant exists.

Browser checks register fresh random test accounts, verify via the private local
encrypted outbox, exercise wrong/correct password, redirect, HttpOnly cookies,
session inventory, refresh, logout, reset and revoked refresh. At both widths,
real browser fetch calls return **200 for own-company context/selection and 403
for cross-company context/selection**. The existing business modules render
after an explicit local test-company creation, and another account starts empty.
Legacy browser data is not imported. No invoice, payment or stock transaction is
fabricated. The browser's legacy workspace selector remains browser-local; these
checks verify the separate server-authorized company API, not a completed
financial-screen migration to server storage.

## Findings and fixes

- The approved 001 authorizer originally returned zero rows: FORCE RLS plus
  `FOR SHARE` also required owner UPDATE visibility on `saas.company_profiles`
  and `saas.billing_accounts`. With explicit separate approval, 002 added only
  two NOLOGIN-owner policies, `USING(true) WITH CHECK(false)`. Actual UPDATE is
  denied through these policies. Runtime grants and FORCE RLS were preserved.
- The first initializer stopped before SQL when empty libpq service-environment
  variables broke `pg_dump`. Removing those variables restored backup creation.
  The guarded resume verified the exact new empty database before applying 001.
- A test initially expected an exception for an RLS-filtered UPDATE. PostgreSQL
  correctly affected zero rows; the assertion now checks zero rows and unchanged
  quarantine state. No permission was relaxed to make the test pass.
- A restart check hit a stale HTTP keep-alive connection. Test requests now use
  independent HTTPS connections; real database restart persistence passed. The
  transaction implementation does not retry ambiguous writes.
- A permission-review tool timeout interrupted one verification attempt; it did
  not execute an extra migration. The final authorized checks completed.

No unresolved failure remains in the requested Stage A database/authentication /
authorization acceptance suite. Production-runtime audit last reported zero
findings; the five existing high development-toolchain findings in the Tailwind 3
dependency chain remain a separate remediation item, not hidden by Stage A status.
Dependency auditing is not a penetration test.

## Isolation and backup evidence

The existing authentication cluster on `127.0.0.1:55439` was offline during the
final checks. With separate explicit user approval it was briefly started only
for `BEGIN READ ONLY`, compared to its preserved baseline, then stopped again.
Counts matched: 15 users, 21 sessions, zero software administrator user grants,
2 companies, and zero invoices/customers/ORS orders in its inspected foundation
tables. No DML/DDL, account/session update, migration or old-app traffic was run
there. Aggregate comparison is evidence of the checked records/counts, not a
claim of a forensic byte-for-byte PostgreSQL filesystem comparison: normal
startup/shutdown changes PostgreSQL control/log/checkpoint metadata.

No production Firebase, published Flutter source/service, mobile customer data,
DNS, Cloudflare, GoDaddy, live Vercel deployment or immutable backup was modified.
No production credential or service connection was used. This conclusion covers
the actions and file scope of this implementation; it is not a remote audit of
changes by other operators. No real administrator was created, no real email was
sent, no Stage B migration was executed and no financial API was enabled.

The initial custom-format database/role backups and pre-correction database
backup are private under `D:\vetthevat.saas-dev\backups`. Archive listings and
SHA-256 integrity are verified. **A restore drill has not been run**; it requires
a separately approved fresh restore target. No existing database was overwritten.

## Remaining limitations and Stage B entry gates

- Private S3/scanner/OCR services are not provisioned or live-tested. Their
  adapter/contract tests use injected transport; quarantine stays fail closed.
- VAT, invoice, ORS, stock and banking financial schemas/commands/frontend
  persistence are not implemented by Stage A. Current business screens continue
  to use isolated browser-local records until their server migration is verified.
- Tenant provisioning, production membership administration, verified paid
  entitlements and quota integration still need implementation. Disposable test
  memberships/accounts are operator-created fixtures in this new database only.
- There is no real administrator, production email verification/delivery,
  real bank/courier/HMRC integration, MFA or production deployment verification.
- Secret rotation, retention, restore drills, background jobs and managed TLS /
  pooling need later operational verification. This local port is not suitable
  for public exposure or production.

The separate `master-stage-b-implementation-plan.md` specifies additive SQL,
private originals/quarantine, extraction/manual review, durable contacts/invoices,
VAT policy/reporting, and stable procurement/inventory/sales integration points.
Stage B requires a new reviewed migration/approval packet and approved isolated
storage/inspection services. Do not enable financial endpoints until their own
authorization, persistence and concurrency tests pass. No deployment is approved.

See `master-stage-a-verification.json` for final machine-readable results and
`master-stage-a-change-inventory.json` for exact project file changes relative to
the preserved master implementation baseline. Private credentials, PostgreSQL
files and build caches are intentionally excluded from that shareable inventory.

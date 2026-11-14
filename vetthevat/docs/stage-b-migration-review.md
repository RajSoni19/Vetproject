# Stage B migration review — 23 October 2026

**Review only. Nothing in this packet authorizes execution. Stage B is incomplete.**

## Exact target and SQL

- Cluster: `D:\vetthevat.saas-dev\cluster`, PostgreSQL 17.
- Host/database: `127.0.0.1:55440/vtv_saas_dev` only.
- Database owner: existing `vtv_saas_database_owner` (NOLOGIN).
- Business schema/function owner: existing `vtv_saas_owner` (NOLOGIN).
- Application role: existing `vtv_saas_runtime`; authentication stays under
  `vtv_web_runtime`. Neither receives owner membership or BYPASSRLS.
- Migration: `database/migrations/saas/003_stage_b_invoices.review.sql`.
- SHA-256: `a881b6bd1278f8bdcd0a0ae74739eb5cdd07defb8883c19f89aea79ecfd5887b`.
- Proposed new worker role: `vtv_saas_document_worker`, LOGIN, NOINHERIT,
  NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS. SQL sets no
  password. Only CONNECT, business schema usage, non-secret migration stamp read
  and four narrow lease functions are granted. No direct financial/auth table
  read/write. Keep its future random local service secret outside Next.js.

`npm run saas:stage-b:review` verifies the actual cluster/database/installation,
original SQL hashes and corrective policies using BEGIN READ ONLY. It has **no
execution mode**. The SQL also guards loopback address, exact data directory,
PostgreSQL major version, owner/security state, Stage A presence, and absence of
the business schema/worker role. It refuses a repeated migration.

## New objects

The machine-readable inventory is
`database/migrations/saas/stage-b.manifest.json`; full constraints, expressions,
grants and functions are in the SQL, rather than an abbreviated inventory.

| Table in `business` | Purpose |
| --- | --- |
| migrations | Installation-bound version 3 marker; no business identities |
| counterparties | Explicit supplier/customer kind, address/VAT/contact metadata, archive/version |
| contact_people | Tenant-linked named contacts |
| tax_codes | Explicit treatments, rates and effective dates; no seeded universal rate |
| invoices | Draft/confirmed facts, direction, counterparty snapshot, version, credit origin |
| invoice_lines | Ordered exact decimal source inputs and computed amounts |
| invoice_revisions | Immutable version snapshots, actor and timestamp |
| invoice_attachments | Composite company/document/invoice ownership links |
| extraction_jobs | Document-version/digest jobs, bounded attempts and expiring leases |
| extraction_results | Immutable page observations, confidence/provenance payloads |
| review_issues | Explicit unresolved/resolved review records |
| vat_periods | Explicit company/date/currency periods |
| vat_adjustments | Immutable reasoned adjustment foundation; no runtime write grant |
| payment_allocations | Future allocations/reversal foundation; no runtime write grant |
| command_keys | Actor/company/operation/permission-bound idempotency and payload digest |
| invoice_usage | Append-only account/month invoice consumption, no runtime mutation |
| source_links | Future typed ORS source IDs, quantities, values and event keys; no write grant |

There are 17 new tables, 16 FORCE RLS tenant tables, six explicitly named indexes
plus PK/UNIQUE indexes, ten functions and ten triggers. Policies: 24 explicit
and 31 generated (16 owner lookups, six contact policies, nine invoice reads).
Four explicit policies affect existing Stage A tables; 51 policies belong to
the new schema. The worker is the only new role.

Constraints include tenant composite foreign keys, invoice/credit signs,
sum reconciliation, ordered line uniqueness, bounded amounts/rates/text/JSON,
typed states, version increments, duplicate counterparty/invoice identity,
credit origin and cumulative credit caps, plus immutable confirmed invoices,
revisions, extraction results, adjustments and allocations.

New invoice usage serializes an account-wide UTC calendar-month quota and locks
the verified entitlement. This is an explicit development billing-period policy,
not evidence of a paid subscription or implementation of provider billing cycles.
Confirmed corrections use linked credit notes; no destructive confirmed edit or
void command is enabled. Fine-grained credit-line treatment matching and full
replacement/correction workflows still need acceptance tests and policy review.

## Existing objects and records affected

No existing user, session, company, entitlement, document or financial row is
updated by this SQL. The only inserted row is the new installation/version stamp.
No sample contacts, tax codes, companies, administrators or financial rows seed.
The existing auth test database on 55439 is not connected.

Four owner-only policies are added to existing tables:

- `saas.subscription_entitlements`: UPDATE visibility for FOR SHARE, with
  `WITH CHECK(false)`, so the quota trigger can lock a verified entitlement while
  rejecting actual owner writes through that policy.
- `saas.document_inspections`: append by the trusted owner function only.
- `saas.document_jobs`: owner updates restricted to inspection jobs.
- `saas.documents`: owner transitions from quarantine to clean/rejected/quarantine.

Those last three grant authority to the trusted NOLOGIN function owner. The
ordinary runtime gains no inspection-writing or clean-promotion privilege. Four
new worker-only functions claim/finish inspection and extraction using server
selected originals, leases, expiry and version/digest checks. They must **not**
be exposed in a public HTTP route or called with browser credentials. A trusted
scanner/decoder host is required before starting workers; fake clean receipts are
not an acceptable integration test.

The standalone upload path can preserve a document and extract observations
before the user knows an invoice number, date, counterparty or tax treatment.
Only reviewed valid data creates a financial invoice draft. OCR never confirms.

## Backup and recovery before approved execution

1. Reverify target installation/data directory/owners, both original hashes and
   original applied-record files, Stage A policies, and absence of Stage B.
2. Pause local app/workers for a consistent review interval. Do not start 55439.
3. Create NEW timestamped custom `pg_dump -Fc` and private `pg_dumpall --roles-only`
   backups under `D:\vetthevat.saas-dev\backups\stage-b-before-<timestamp>`.
   Never overwrite prior Stage A or corrective backups. Use explicit loopback
   credentials from the restricted runtime file, never inherited PG service/URL
   selectors. Do not print passwords/role backup contents.
4. Verify `pg_restore --list`, SHA-256 each backup, and securely record target,
   installation and SQL digest. Archive listing is not a restore drill.
5. Require the exact approved SQL hash immediately before execution; execute
   this one transaction and require acknowledged COMMIT. Record the digest and
   result privately only after acknowledgment, then inspect actual catalogs.

An SQL error rolls back this transaction, including role/schema DDL. An unknown
commit outcome requires inspection; never automatically rerun/drop/overwrite.
After commit, use an approved forward correction or separately approved restore
into a fresh target. There is no destructive automatic down migration. An actual
restore drill needs a separately approved fresh database/cluster target. Never
restore over this development database or the old authentication database.

## Authorization and acceptance gate

Requests reuse verified opaque PostgreSQL sessions, HttpOnly cookies, same-origin
and session-bound CSRF checks, request limits and server-selected permissions.
Membership is UUID/FK based, with the Stage A live authorization locks held for
the transaction. A supplied company selector never establishes membership.

New tables FORCE RLS. Composite foreign keys prevent attaching a different
tenant's contact, invoice, original or invoice line. Quota counting is account-wide
under a deterministic advisory lock. Commands, revisions, usage and audit commit
together; idempotent replay does not consume another invoice. Raw runtime cannot
promote quarantine, call workers, activate entitlements or alter schemas.

The prepared PostgreSQL repository runner has 12 scenarios. It must pass after
approval, along with additional quota-last-slot, worker lease/crash, scanner,
provider conditional/version read, OCR/manual review, revision/confirmation race,
company permission/revocation, SQL rollback and restart persistence scenarios.
That runner alone is **not** the full Stage B acceptance suite. New schema syntax
was parsed offline; PL/pgSQL execution, privileges, forced RLS, locking and actual
business persistence have not yet been verified. Any required SQL fix needs its
own reviewed hash and approval.

No financial endpoint is mounted. No frontend screen uses these commands yet.
Do not change that gate until actual authorization, persistence and isolation
tests pass. Production/mobile systems, Firebase, DNS, Vercel and immutable backup
remain outside this operation.

## Exact approval request

Approve ONLY the documented pre-change backups and execution of
`database/migrations/saas/003_stage_b_invoices.review.sql`, SHA-256
`a881b6bd1278f8bdcd0a0ae74739eb5cdd07defb8883c19f89aea79ecfd5887b`, on the
existing isolated `D:\vetthevat.saas-dev\cluster`,
`127.0.0.1:55440/vtv_saas_dev`, including its documented new worker role/grants
and four existing-table owner policies, followed by disposable integration
fixtures only in that database. This excludes real administrators, production,
port 55439, later migrations, public financial API activation and deployment.

This pause comes directly from your Stage B instruction: **“Do not execute any
new migration without separate explicit approval.”** No new migration has run.

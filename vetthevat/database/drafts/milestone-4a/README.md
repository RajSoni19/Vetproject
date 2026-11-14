# Milestone 4A atomic baseline ? REVIEW ONLY, DO NOT EXECUTE

`001_atomic_vat.review.sql` is an alternative EMPTY baseline assembled from the
3B draft with added billing/customer, finite/bounded amount and original-manifest
checks, indexes, RLS and creator-default privilege review in ONE transaction.
Do not apply it after the older baseline or against an unknown existing schema.
Original database drafts and all verification scripts are unchanged. Nothing here
was executed or PostgreSQL-parsed. Static tests are not a SQL execution test.

## Trust and ownership

Owner reports earlier dev/test runtime and dev migrator verification. This task
has no new query evidence and makes no PostgreSQL connection. Test migrator,
administrator cluster/HBA/default-ACL checks and original output review remain gates.

Later approved execution must explicitly assume the environment's NOLOGIN owner
through its separate migrator, and prove runtime cannot inherit/SET that owner or
migrator. Preflight allows only vetthevat_dev/test and exact effective owner names;
it stops on unexpected creator default grants or an existing vat schema. Objects
and security function belong to this effective creator, not the database owner
by implication. Global default PUBLIC function/type access is revoked atomically;
that privilege change itself requires later approval. No runtime GRANTs are supplied.

The ticket-based RLS proposal replaces bare app.user_id/company_id authority.
A separate trusted broker must independently verify Firebase session, current
identity mapping, company/billing membership and requested capability. It mints
32 random bytes (43 base64url characters), stores only SHA-256 and binds the
claim to runtime role, backend PID, transaction xid8, company and a short expiry.
Runtime sends only the opaque ticket through parameterized transaction-local
set_config after BEGIN; it cannot mint, read or insert claims. Helper also rechecks
active user/company/account/memberships and role capability. Reusing a ticket on
another pooled connection or later transaction fails by design, but this MUST be
proven with PostgreSQL integration tests before trust.

**Additional approval required:** broker trust boundary, credential/service placement,
claim insertion/cleanup policy and bootstrap privileges. Another pool in the same
compromised process is not an independent trust boundary. No broker credential,
function grant, session route or functioning identity/bootstrap is implemented.
Owner-only helper-read policies are deliberately limited to lookup tables and
runtime policies name only the verified runtime role. Audit/identity/session/
idempotency/legacy tables receive no blanket runtime reads. Role/capability matrix
is a review proposal; table DML stays denied. No policy provides write access.
SECURITY DEFINER has a fixed search_path and PUBLIC execution is revoked, but owner
and superuser remain trusted; review indirect memberships and callable routines.

## Concurrency commands still required

All commands must pass verified scope, mutation headers/version and payload hash;
commands own the transaction, idempotent outcome and immutable audit event.

- Invoice usage: lock billing account, then exact non-overlapping billing period;
  check verified plan and capacity, count pending+committed across companies. A
  company-qualified account FK prevents spending another account's quota. Unique
  company/invoice usage identity survives period rollover so an edit cannot consume
  again. Reserve invoice+usage in the SAME transaction (deferred invoice FK), then
  commit invoice, canonical line/group totals, revision, idempotency result and audit.
  Lease recovery/release must lock the same rows. Never refund by deleting history.
- Company/member capacity: lock the account for active resources and pending
  reservations. Includes owner in seats. Decide whether pending invitations and
  archived companies consume capacity; protect last owner and account transfers.
- Banking: consistent account/period (when involved), bank transaction IDs sorted,
  then invoice IDs sorted. Lock ALL rows affecting allocation/amount/currency and
  re-read active sums, versions, matching company/currency and invoice eligibility.
  Net allocation cannot exceed absolute statement amount or invoice outstanding.
  Reconcile only fully allocated eligible records; reversal is immutable history,
  not DELETE. Active transaction/invoice pair uniqueness blocks repeated accidental
  allocation; use versioned amount updates or explicitly reviewed partial-payment
  additions. Command lock order and revalidation are mandatory, not comments that
  magically enforce aggregates. Helpers only prepare sorted FOR UPDATE calls.
- Existing financial policy: quantity/price four decimals; discount/rate two;
  round product net to pennies, subtract line discount, then VAT per line. Exact
  string/BigInt calculation is parity-tested; confirmed totals must match all line
  and rate-group sums. Drafts retain optional header data, zero/incomplete lines
  and unknown direction/classification. Current numeric checks are defence in
  depth; reject excess scale BEFORE PostgreSQL NUMERIC silently rounds it.

Cross-row sums, quota ceilings, period overlap, immutable bank-account currency,
status transitions, canonical duplicate reservation and append-only audit still
require exclusive reviewed write commands and real race tests. This candidate
makes none operational. Revisions/source observations must never trust client
net/VAT/gross totals or fabricated identities.

## Later isolated validation checklist

1. Review administrator and test-migrator evidence, instance identity, CONNECT/
   CREATE/TEMP, schema CREATE, SET memberships and global/creator defaults.
2. Approve SQL and runner/checksum policy, take database+roles/object backup, prove
   restore in another isolated database. No production or browser data import.
3. Apply the reviewed atomic EMPTY baseline only to authorized synthetic target.
   ON_ERROR_STOP and one transaction; stop on any unknown existing object. No
   automatic DROP/reset or role replacement.
4. Test role grants, missing/forged/expired/replayed tickets, wrong connection/
   transaction, disabled membership, wrong capability and cross-company FKs.
   Test helper search_path/owner/recursion and privilege escalation with actual roles.
5. Two-connection tests: last quota slot across companies, same idempotency key with
   changed payload, new period edits, concurrent split allocations and reversals,
   invoice edit vs allocation, failed COMMIT and worker retry. Verify audit parity.
6. SQL finite/NaN/infinity, decimal overprecision, duplicate genuine lines, missing
   originals, zero-rated/exempt/out-of-scope and incomplete draft tests.

## Rollback and preservation

Before cutover, a failed candidate rolls back atomically. If a later migration
committed or new data exists, preserve it, disable backend routing and return to
unchanged local mode; use forward repair or restore a reviewed isolated backup.
No automatic down migration deleting financial history. Restore database, role
ACLs, private object versions and manifests together. Export/import of browser
records needs separate authorization, encrypted raw copies, legacy IDs, explicit
company/account ownership and count/line/currency/net/VAT/gross/checksum reconciliation.
Never convert local Team records to authenticated memberships or infer ownership
from email. Preserve missing originals as missing.

References: [PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[core SHA-256](https://www.postgresql.org/docs/17/functions-binarystring.html),
[transaction identity functions](https://www.postgresql.org/docs/17/functions-info.html).

# Milestone 3B review drafts — DO NOT APPLY

These files are design artifacts, not registered migrations. No migration runner,
database, roles, extensions or grants were created. The original
`database/001_initial_schema.sql` is unchanged and must not be applied alongside
these drafts. PostgreSQL 17 syntax/constraints/RLS still need actual isolated tests.

Proposed order after separate approval:

1. Administrator verifies local cluster identity (administrator-only
   `pg_control_system()`), loopback endpoint, database and restricted roles.
   Stop on existing objects; never drop, reset or replace them. Separate owner,
   migrator and runtime per environment; runtime cannot SET owner/migrator.
2. Select a migration runner/checksum ledger with approval before installing it.
   Migrations run under explicit owner role assumed by the migrator. Runtime must
   have no CREATE/TEMP/database ownership/schema ownership, privileged memberships
   or BYPASSRLS. Revoke PUBLIC database CONNECT/TEMP and public schema CREATE only
   through separately reviewed environment setup; deny cross-environment CONNECT.
3. Review this candidate schema in a new isolated synthetic database. It is an
   alternative baseline, not an ALTER script against an unknown deployed schema.
   No destructive fallback. Draft verified invoice checks require a service-level
   reconciliation transaction; table constraints alone are insufficient.
4. Review RLS and role/action matrix. Runtime receives explicit SELECT grants only
   initially. No blanket default DML privileges. Add individually reviewed write
   policies/grants/commands with membership, version and audit tests. No runtime
   membership/identity/session/audit administration grants.
5. Run cross-company FK/RLS/permission/concurrency/integrity tests using real
   restricted roles, including missing, spoofed and pooled transaction contexts.
   Reapply user/company context with parameterized transaction-local set_config
   only AFTER verified identity and membership checks. GUCs are not authentication.
6. Preserve existing browser-local records and original bytes. Import requires a
   separate approved dry run, encrypted raw snapshot, explicit company ownership
   mappings, legacy IDs and count/line/currency/status/checksum reconciliation.
   Missing originals remain missing; blob URLs are never durable object keys.

All money crosses the new API as decimal strings. Original frontend arithmetic
and rounding policy remain unchanged. NUMERIC/BIGINT are never globally converted
to JavaScript numbers. API values need bounds/sign validation before writes;
finalised invoice sums must reconcile exactly under the existing line-rounding
policy. Null classification/direction stays unknown, including historical records.
No supplier-name uniqueness: identical names do not prove identical identity.
Supplier folders are company+supplier associations, not public filesystem paths.
Uncertain matches remain Needs Review; original immutable object keys survive
supplier renames. Document uploads require checksum/size/MIME verification,
malware policy, authorization and orphan cleanup before durable confirmation.

Before a later cutover, preserve support, notifications, settings and legacy
activity from the old draft/local model through separately reviewed migrations;
the candidate below focuses on VAT core and banking, not feature cutover. No
Firebase/Flutter data availability is assumed. Never import local Team roles as
authenticated memberships. Never infer sale/purchase or zero/exempt categories.

Rollback: keep existing frontend local mode and source recovery copies; leave any
future failed database isolated and inspect it. Do not DROP databases, delete
objects or roll back financial history automatically. After approval, back up
database+role grants and private originals together and test restore in isolation.

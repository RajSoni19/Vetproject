# API v1 foundation boundary

Implemented helpers: `lib/server/api-v1.ts` validates JSON byte limits, strict
allowed object keys, UUIDs, decimal-string invoice lines, optional explicit tax
classification, pagination, mutation version/idempotency headers and same-origin
requests. Responses carry generated request IDs, no-store and redacted errors.
`lib/server/identity.ts` requires an injected real identity verifier and active
membership/capability resolver. Neither has a default authenticated implementation.

No `/api/v1` business routes are enabled; the current frontend adapter is unchanged.
Proposed route families for later stages: company-scoped invoices/lines/revisions,
suppliers/aliases, documents/uploads/downloads, reports/exports, bank accounts,
imports/transactions/allocations and audit. Routes must use Node runtime and a
server-only DAL. Do not pass a database object or environment configuration to
Client Components/Server Action responses. No API accepts browser-provided SQL.

Future route sequence: validate path/body/headers -> origin/CSRF for mutations ->
verify web identity -> resolve active company membership and explicit capability ->
begin database transaction -> set user/company context locally via parameterized
`set_config(..., true)` -> execute scoped queries -> write audit/idempotency result
atomically -> commit -> return a minimal validated DTO. A selected company is not
permission. Authentication/membership resolution needs a separately approved
bootstrap access design; the draft grants no identity-table access to runtime.

The current line parser is a structural foundation, not final invoice validation.
Save/verify endpoints still need full date/status/range/line-total/duplicate rules,
existing rounding policy on exact scaled integers, and concurrency tests. Decimal
string validation does not authorize negative values, arbitrary quantities or tax
rates. Header contracts do not themselves enforce idempotency or version conflicts:
DB unique reservation plus payload digest and conditional version update are needed.
Signed cursor/company binding, response DTO schemas, safe 404 handling, rate limits,
upload streaming/MIME checks and export authorization remain route-specific work.

Database factory is lazy and unused by the frontend. Pools are bounded per module/
Node process; hosting instance count must be budgeted against total DB connections.
Future dev hot-reload integration must ensure one pool per active runtime and close
old pools; no live development consumer exists in this milestone. Checkout preflight
rejects mismatched identity/port/local address, administrative flags, memberships,
object ownership, CREATE/TEMP and opposite local environment CONNECT. This preflight
is source-tested, not database-tested. It does not verify cluster system identity;
the administrator must separately verify that before enabling connections. RLS is
not proven by preflight, and the transaction SQL API accepts trusted DAL code only.
Release is guaranteed after acquired-client work; timeout, rollback failure and
uncertain commit discard the connection. No automatic transaction retry is made.

Implementation references: installed Next 16.4 data-security and Route Handler
guides; [node-postgres pool](https://node-postgres.com/apis/pool),
[client](https://node-postgres.com/apis/client), and
[PostgreSQL 17 privilege functions](https://www.postgresql.org/docs/17/functions-info.html).
Installed pg 8.16.3 source/type definitions were checked for the actual timeout,
release and parser options rather than relying on newer library examples.

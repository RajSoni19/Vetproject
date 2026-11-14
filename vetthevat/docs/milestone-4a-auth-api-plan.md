# Milestone 4A authentication, API and storage readiness

Local interfaces only. No Firebase SDK, project/credential access, session route,
PostgreSQL access or provider storage is enabled. Server entry:
`lib/server/preparation.ts` has the server-only marker; pure modules allow injected
unit tests. Existing frontend services keep their labelled browser-local source.

## Identity and web-session plan

Before activation obtain owner-verified project identity matching published Flutter,
providers, allowed web origins, UID lifecycle/tenant claims, emulator constraints,
email verification/MFA policy and versioned mobile API expectations. A reviewed
configuration reference is a server-side approval record, not proof created by a
request field. No verified project information is assumed available here.

`auth-preparation.ts` defines the Firebase session adapter port; no fake/default
verifier exists. Real adapter verifies signature/algorithm, issuer/audience/project,
expiry, disabled/revoked state and recent auth_time. Its authTime/expiresAt values
are milliseconds; Firebase auth_time/exp seconds must be converted explicitly.
Identity mapping uses unique (project, UID), never matching by email. `identity.ts`
existing per-request session verifier remains the integration port for authenticated
requests; new scope resolution requires active company/billing membership/capability.
Role matrix Owner/Admin/Finance/Accountant/Staff/Viewer is a proposal for approval;
no local Team role or Firebase client claim grants access automatically.

Proposed browser session: Firebase Admin session cookie, __Host name, Secure,
HttpOnly, SameSite=Strict, Path=/, no Domain, bounded five-day lifetime. Recent login
within five minutes required before issuance. Real storage/revocation index and
per-web-session denylist must be designed before a route is wired. Clear web cookie
and revoke web session only at logout; do not call global refresh-token revocation
that could log Flutter users out. Global user disable/provider changes require
separate impact review with Flutter developer.

CSRF: reviewed exact HTTPS Origin + Sec-Fetch-Site same-origin and a constant-time
HMAC token bound to a SERVER-HELD session binding; secret >=32 characters/private.
Browser obtains CSRF through a same-origin protected endpoint; login needs its own
server-created anonymous challenge binding, not an arbitrary client session ID.
Apply this guard before creating sessions and every cookie-authenticated mutation,
including logout, uploads and billing changes. Reject CORS wildcard/credential
combinations. Rotation and concurrent tabs need tests. No routes were added.

Firebase Admin exact package/version and private credentials still require approval.
Prefer platform identity/ADC over checked-in keys. Never send keys in chat or use
NEXT_PUBLIC server credentials. Do not create a competing auth system or change
Flutter, Firestore rules or Firebase providers.

References: [ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[session cookies](https://firebase.google.com/docs/auth/admin/manage-cookies).

## API contract registry ? proposed /api/v1, no enabled endpoints

All protected routes: real session -> trusted principal -> capability -> rate/size
limits -> strict request validation -> bound company context -> narrow DAL -> DTO.
Company ID in route is a selection requiring authorization, not trusted identity.
No account/user/actor/capability/storage key accepted in business bodies.

| Resource/route proposal | Prepared validator/contract and capability |
|---|---|
| GET/POST companies; PATCH company | companyCommand; company:read/manage; creation additionally locks billing company capacity; membership/bootstrap out of ordinary runtime access. |
| GET/POST/PATCH customers/suppliers | contactCommand; contacts:read/write; company-qualified IDs, no email-based user linkage or forced supplier merge. |
| GET/POST/PATCH invoices; confirm | invoiceCommand/financialLine; invoices:read/write; strict decimal strings, optional classifications, bounded lines, no caller totals. Server computes net/VAT/gross and persists revisions. |
| Documents/original upload/download | uploadIntent/verifyOriginalBytes/PrivateStoragePort; documents:read/write; UUID document/company mapping, immutable opaque object version. |
| Bank accounts/imports/transactions | bankAccountCommand/statementImportCommand/bankTransactionFilters; banking:read/write. Statement bytes parsed server-side by a future reviewed parser; client mapping contains distinct indexes, never authoritative totals/transaction rows. |
| Allocations/reconciliation/reversal | bankAllocationCommand/reconciliationCommand/reversalCommand; banking:write. Minor-unit strings and IDs only, server checks locked balances/currency/status. No client mark-reconciled bypass. |
| Reports XLSX/PDF | reportCommand/scopedFilters plus reports:read/export; same selection server-side, bounded asynchronous export later, cursor/signature and original access independently checked. No submitted VAT return claim. |
| Subscription usage | verified account membership -> resolvePlan and atomic ledger ports; billing:manage for changes; browser cannot supply plan/allowance/price/period. |

`scopedFilters` enforces allowed keys, duplicate-key rejection, limit/cursor bounds,
exact dates/range, currency/direction/status and supplier/customer UUIDs. Future
resource-specific filters may narrow these further; unsupported statuses must not
be silently accepted. Cursor bytes must be signed/bound to company+filter scope,
not fed to SQL. No dynamic SQL from request names/sort expressions.

Financial mutations require mutationHeaders (idempotency key + quoted If-Match),
canonical payload digest and atomic idempotency result/revision/audit. Same key with
different payload conflicts; never auto-retry uncertain commits. A type/validator
is not a live idempotency store. AuditCommandPort requires trusted actor, request ID,
entity and versions; monitoring allowlists operation/status/duration/request ID.
No logs of tokens, keys, cookie/Authorization headers, file content or customer
records. Ports are not configured monitoring/alerting or durable append-only audit.

## Private originals and safe parsing

Server upload intent permits invoice PDF/JPEG/PNG <=10 MiB, statement CSV/XLSX <=5 MiB,
non-path filenames, SHA-256 and byte count. Receipt verifies actual bytes/hash/type
before private staging; PDF/image signature checks are not malware/decompression
proof. Parse/page/pixel/time/memory/concurrency limits and malware policy still
need a real quarantine worker. Existing browser OCR functionality stays unchanged.
Do not introduce a new parser using the currently vulnerable xlsx on a live server.

PrivateStoragePort stages opaque IDs, checks immutable object version/checksum,
waits for clean malware result and only then allows Available state. Provider/region,
encryption, retention, versioning, legal hold, lifecycle, URL TTL, restore and IAM
need owner decisions. Authorize every preview/download and do not expose raw bucket
keys/credentials. Supplier folders are company+supplier associations; renamed or
uncertain suppliers never move/delete original bytes. Reattachment adds a version
and audited association. Object storage and SQL cannot share a transaction: durable
outbox/state machine and orphan cleanup are required, never fake atomic success.

## Integration sequence and gates

1. Approve dependency source/version remediation and verify artifact integrity before
   installing; rerun financial/workbook/browser regression suites.
2. Obtain pending administrator/test-migrator evidence and approve atomic candidate,
   role/capability/broker model and runner. Synthetic database execution requires
   separate explicit authorization; no changes have been made to roles/databases.
3. Run DB role/RLS/cross-company/financial/concurrency and backup+restore tests before
   real endpoints. Keep disabled by default if any configuration/service is absent.
4. Verify owner Firebase identity configuration, approve SDK and web-session/CSRF/
   revoke behaviour, then isolated emulator/verifier tests; preserve Flutter unchanged.
5. Approve private storage, quarantine/parser and signed-download/outbox integration.
6. Implement real commands with atomic quota/capacity/idempotency/audit, then connect
   existing feature service boundaries incrementally. Never clear or reseed local data.
7. Separately approved local-data import/dry-run/reconciliation and source switch;
   production/DNS/deployment are outside 4A and still require authorization.

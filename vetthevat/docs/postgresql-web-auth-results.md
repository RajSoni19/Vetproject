# PostgreSQL web authentication delivery

23 October 2026. PostgreSQL-backed authentication is implemented and verified in
the explicitly approved isolated environment. **This is not production readiness.**
No production Firebase, Flutter, PostgreSQL, Vercel, Cloudflare or GoDaddy service
was contacted or modified. No existing database was migrated, no real email was
sent, no administrator was created, and `D:\vetthevat-backup` was untouched.

This report supersedes the web-authentication provider/status claims in
`application-auth-restoration-results.md` and the earlier Firebase emulator /
SQLite milestone report. Those files remain historical records.

## Implementation

- Removed the web-only Firebase SDKs, token/cookie adapters, emulator setup,
  SQLite session/grant implementation, login component, environment template
  variables and Firebase-specific tests/tools. The old local `.auth-dev` state is
  retained privately, excluded from deployment, and is never read by the new
  runtime. No mobile service or shared production configuration was changed.
- Added PostgreSQL users, sessions, role grants, companies, memberships,
  verification/reset token hashes, append-only audit, atomic rate buckets,
  encrypted notification outbox, installation fingerprint and one-time bootstrap
  marker. UUID keys, constraints, indexes and separate restricted roles are used.
- Argon2id passwords use individual library-generated salts, 19 MiB memory, two
  iterations and parallelism one. Passwords are 12–128 characters; passwords are
  never normalized or persisted as plaintext. Session and account-action tokens
  contain 256 random bits. Only SHA-256 token digests are stored in token/session
  tables. Email links are AES-256-GCM encrypted in the durable outbox.
- Cookies use `__Host-vetthevat-session`, HttpOnly, Secure, SameSite=Strict, Path=/,
  no Domain and a fixed five-day lifetime. Every request rechecks database expiry,
  revocation, active status, verified email and current role grants. Browser
  refresh/focus revalidates; it does not extend the fixed expiry. Logout and
  password reset revoke sessions on the server. Settings lists only the current
  user's sessions and allows individual revocation.
- Login uses generic failure messages and a dummy Argon2id hash for unknown
  accounts. Login and account actions use durable account/global throttling with
  PostgreSQL advisory transaction locks. Mutations require exact Origin and
  same-origin fetch metadata; authenticated mutations also require a session-bound
  CSRF token. Strict request keys and body/field limits reject forged roles/scope.
- Ordinary verified users can reach business interfaces. Software administrator
  grants are checked separately by Proxy, the admin layout and admin APIs. Company
  Admin/Owner roles do not confer software administrator access. The runtime role
  cannot issue software administrator grants.
- The original invoice/ORS/public UI and financial calculations were preserved.
  Browser financial records use a new per-user opaque namespace, with no fallback
  or automatic migration from legacy/Firebase namespaces. This prevents automatic
  exposure through the application; localStorage itself is not secure accounting
  storage or a substitute for server tenant isolation.

## Approved migration and actual services

| Item | Verified target/result |
| --- | --- |
| Identity authority | PostgreSQL users + Argon2id; no Firebase web identity |
| Database | PostgreSQL 17.11; NEW cluster `.auth-pg/cluster` |
| Address | `127.0.0.1:55439/vtv_web_auth_test`, loopback only |
| HTTPS application | `https://localhost:3443`, loopback only, private local certificate |
| Migration | `database/migrations/web-auth/001_web_auth.review.sql` |
| Approved SQL SHA-256 | `19EFFF1A3945E02FC2936103C6B9CE26536CEA87A4EEE0D3A85E733DA3AE6FD8` |
| Storage role | `vtv_web_runtime`, not owner/operator |
| Financial RLS test role | `vtv_web_business`, cannot read auth session hashes |
| Private operator state | `.auth-pg/runtime.json`; operator/SYSTEM/administrator/task ACL, ignored and excluded from Vercel |
| Real administrator | Not created; zero user-role grants |
| Real email | Disabled and not tested |

The first Windows startup attempt stalled because the database process inherited
a pipe held by the synchronous initializer. Only the newly approved cluster was
stopped. Offline single-user operator recovery preserved SCRAM authentication;
the initializer then applied the original approved SQL. No authentication bypass
or change to an existing cluster was used. Normal startup now ignores inherited
stdio. The recovery script refuses a running or already configured cluster.

## Routes

Public routes passed: `/`, `/about`, `/features`, `/pricing`, `/contact`, `/support`,
`/get-started`, `/privacy`, `/terms`. Account pages: `/login`, `/register`,
`/verify-email`, `/forgot-password`, `/reset-password`.

Verified ordinary accounts reached `/app/dashboard`, `/app/invoices`,
`/app/invoices/upload`, `/app/customers`, `/app/suppliers`, `/app/banking`,
`/app/reports`, `/app/vat`, `/app/ors`, `/app/settings`, `/app/subscription`.
The build also includes invoice/document detail and review routes; populated
financial workflows were not verified end to end with durable records.

Anonymous private page access redirects to login. Anonymous admin APIs return
401; ordinary users receive 403 for `/api/admin/leads` and `/app/admin/leads`.
Successful real administrator navigation/role-removal tests were deliberately
not performed because creating an administrator has not been approved. Role
separation/removal logic has unit coverage, role reads occur on every request,
and real database tests prove the application role cannot assign grants.

`/api/stage1/*` and unknown financial APIs remain denied, including for signed-in
users. No browser company ID enables a financial endpoint. `/api/account/companies`
provides authenticated, membership-filtered company list/create operations with
server-derived ownership; existing browser company editors are not migrated to
this API in this milestone.

## Verification

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run auth:pg:build` | Passed, Next.js 16.4.2 production build with public and protected routes |
| `npm test` | 161 passed; domain/unit tests and injected adapters, not 161 live service tests |
| `npm run test:auth:pg` | 16 real PostgreSQL + HTTPS integration scenarios passed |
| `node tests/pg-auth-durability.cjs` | Account/session survived an actual isolated PostgreSQL restart; logout then invalidated the session |
| `npm run test:browser:auth:pg` | Real Chrome registration, verification, wrong/correct password login, private navigation, refresh, logout, password recovery and revoked refresh passed at 1440/390 px |
| `node tests/browser-invoices.cjs --routing-only` | Public desktop/mobile navigation and 25 private route variants passed with auth disabled; forged role/cookie/localStorage rejected; marketing gate retained |
| Screenshots | `docs/previews/postgresql-auth/`; mobile login and authenticated desktop dashboard visually inspected |

Real integration coverage includes unique normalized registration, Argon2id at
rest, encrypted outbox, unverified/incorrect credentials, invalid tokens, SQL
injection inputs, hashed cookies, one-use verification/reset, expired verification
and session, concurrent token consumption, suspension, logout, reset revocation,
CSRF/origin/duplicate cookies, own-session boundaries, company ownership, real
forced RLS hiding an existing other-company row, forbidden business writes,
auth-secret access denial, grant/status/audit modification denial, and concurrent
rate limits. Test users are random `@example.test` identities with random passwords
held only in process memory. No automatic demo account, company or financial
seed exists. Synthetic RLS records are rolled back. Browser tests explicitly create a local test-company through the existing form after proving that a fresh account starts empty; they then render the actual business modules and real own-session panel. The second account starts empty in the same profile. No invoices, bank transactions or ORS orders are created. ORS remains a setup-required interface with submission disabled.

The notification retry scenario uses **real PostgreSQL persistence with a mocked
failing transport**, so no provider is contacted. The durable pending job remains
and the saved account survives. HTML escaping and provider acceptance logic use
mock transport unit tests. The application records acceptance only after a
provider-confirmed ID; it does not equate acceptance with inbox delivery.
Consumed/superseded links are removed from pending delivery. Email delivery is
not claimed as verified. Browser tests consume encrypted local outbox links via
the private test operator; there is no public token-read endpoint.

Dependency audit also found a DOMPurify issue in the existing jsPDF dependency
chain. It is pinned to patch 3.4.17, the maintainer's patched version:
[DOMPurify advisory](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7).
See the final verification JSON for dependency audit results.

## Administrator bootstrap

`npm run auth:pg:bootstrap:preview` is a dry run and creates nothing. It was run.
The executable operator command is `node scripts/pg-auth-bootstrap.cjs --execute`.
It is deliberately limited to the isolated database above, checks its installation
fingerprint, requires an unused bootstrap marker, takes a transaction advisory
lock and refuses an existing `admin@vetthevat.com` account. The operator must
supply private `WEB_AUTH_BOOTSTRAP_NAME`, `WEB_AUTH_BOOTSTRAP_PASSWORD` and exact
`WEB_AUTH_BOOTSTRAP_CONFIRM=CREATE ADMINISTRATOR IN vtv_web_auth_test` environment
values only after separate owner approval. Do not place a real password in shell
history, files or documentation. No actual administrator/password is embedded.

Bootstrap inserts an unverified account, the explicit software administrator
grant, audit event and consumed one-time marker atomically. Email verification
is still required: request instructions through `/verify-email` once approved
mail is configured, or use an explicitly approved isolated operator verification
procedure. It never marks an email verified just because its text matches the
intended address. No public bootstrap API exists. Production bootstrap requires
a separately reviewed operator runner for the approved production target.

## Local commands and state

The approved test database is already initialized. **Do not re-run initialization
or the migration.** Use `npm run auth:pg:build` and `npm run auth:pg:start` to build
and serve using private local configuration. PostgreSQL must be running on the
fixed test port. Browser tests require installed Chrome and use fresh temporary
profiles and a certificate pin scoped to this test certificate. They do not alter
global trust settings or the user's normal browser profile.

The isolated cluster may be stopped with the installed PostgreSQL 17 `pg_ctl`,
using only `-D D:\vetthevat\.auth-pg\cluster -m fast -w stop`. Starting that same
cluster must bind `-h 127.0.0.1 -p 55439`; no Windows service was installed.
No test password is provided for manual sign-in. Real account creation/bootstrap
and delivery have separate approval requirements.

Convenience commands `npm run auth:pg:db:status`, `npm run auth:pg:db:stop` and
`npm run auth:pg:db:start` manage only the already configured isolated cluster.
They never initialize a cluster or run migrations. Start refuses an occupied
cluster; configuration/path checks must pass first.

## Vercel environment and production gates

All names below are **server-only**; none use `NEXT_PUBLIC_`. `.env.example` is a
template, not a deployment configuration. Local scripts supply local credentials
without writing `.env.local`. Vercel configuration was not changed remotely.

| Variable | Required value/purpose |
| --- | --- |
| `WEB_AUTH_ENABLED` | `1` only after the selected environment is ready; otherwise fail closed |
| `WEB_AUTH_ENV` | `test`/`development` only for the fixed local target; `production` for reviewed managed hosting |
| `WEB_AUTH_ORIGIN` | Exact HTTPS origin, no path/trailing slash |
| `WEB_AUTH_DATABASE_URL` | `postgresql://vtv_web_runtime:<encoded-secret>@<host>:<port>/<database>`, no query/hash |
| `WEB_AUTH_DATABASE_NAME` | Exact approved database name |
| `WEB_AUTH_DATABASE_TLS` | `verify-full` required for production; local loopback uses `disable` |
| `WEB_AUTH_INSTALLATION_ID` | UUID read by the operator from the approved migration target |
| `WEB_AUTH_CSRF_SECRET` | Independent random 32-byte hex secret |
| `WEB_AUTH_OUTBOX_KEY` | Different random 32-byte hex AES key; retain securely while jobs remain |
| `WEB_AUTH_PRODUCTION_CONNECTION_APPROVED` | `1` only after explicit production-connection approval |
| `WEB_AUTH_PRODUCTION_DATABASE_APPROVED` | Exact approved production database name |
| `WEB_AUTH_EMAIL_DELIVERY_APPROVED` | Keep `0`; set `1` only with explicit real-email approval |
| `WEB_AUTH_EMAIL_FROM` | Provider-verified sender mailbox, not user input |
| `WEB_AUTH_RESEND_KEY` | Server-only send credential for the selected verified domain |
| `WEB_AUTH_WORKER_SECRET` | Independent random secret, at least 32 characters, for private POST worker |
| `VETTHEVAT_MARKETING_ONLY` | Existing gate; keep current production setting until approved deployment |

The Resend worker is `POST /api/internal/auth-notifications`, with a bearer worker
secret. No automatic schedule has been installed. Schedule and approve delivery
separately; never expose worker secrets to browsers. Verification/reset messages
are durable with bounded leases, retries, stable provider idempotency keys and a
review state. Pending jobs need monitoring and an approved operator runbook.

The lazy Node `pg` pool is bounded to three connections per runtime pool, with
connection/query/statement/idle-transaction timeouts, finite connection lifetime,
TLS certificate verification in production and a database/role/fingerprint check
on every transaction. Commit acknowledgement is required. A managed transaction
pool endpoint may be used only after verifying TLS, role identity, session-user
semantics, total serverless concurrency and transaction behavior. No prepared
statement/session-GUC assumption is required. Operator credentials are absent
from application configuration. Linux native Argon2 packaging and real managed
pool behavior still require a separately approved staging deployment test.

`.vercelignore` includes public and protected application sources and excludes
private local state, migrations, tests, docs, credentials and operator scripts.
`vercel.json` remains unchanged; no deployment ran.

## Remaining blockers and explicit approval steps

1. Approve a production identity/database target and separately review/apply its
   migration and restricted roles. No existing/production database is approved.
2. Approve actual administrator creation, privately supply credentials, complete
   real email verification, and test successful admin navigation and grant removal.
3. Approve/configure a verified email sender, delivery key, monitored worker and
   recovery procedure; verify acceptance and actual delivery with owned addresses.
4. Complete authoritative financial commands, company ownership mapping, usage /
   transaction constraints and durable accounting integration before enabling
   financial APIs. Read repository/schema foundations are not a working ledger.
   Existing business/ORS UIs still use account-scoped browser records. Documents
   need approved private object storage and authorization. MFA is not implemented.
5. Configure and verify the separate existing PostgreSQL lead intake service,
   Turnstile, notification provider and administrator workflow. No real lead or
   lead-email delivery was verified in this authentication milestone.
6. Review operational cleanup/retention, audit monitoring, backups, secret/key
   rotation, recovery, rate-limit capacity and managed pooling; then explicitly
   approve staging/production credential use and deployment.

Exact source/test/document changes, including retired files, are listed in
`postgresql-web-auth-change-inventory.json`. Generated local credentials, database
files and runtime state are intentionally excluded from that shareable inventory.

Final production dependency audit: **zero known vulnerabilities** after the
DOMPurify patch. Full audit still reports five high findings in the existing
development Tailwind 3 / fast-glob / micromatch / braces / chokidar chain. No
automatic Tailwind major-version change was made; this remains a separate build
toolchain remediation item. Dependency audit results are not a penetration test.

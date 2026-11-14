> Current status (23 October 2026): web authentication now uses PostgreSQL. See [PostgreSQL authentication results](postgresql-web-auth-results.md). The provider/setup claims below are historical and superseded.

# Milestone 4A — isolated development authentication

22 October 2026. **Working development login has been verified against real local services. Production authentication and the financial backend are not operational.** No production Firebase, Flutter, PostgreSQL, Cloudflare, GoDaddy or Vercel settings were modified. No deployment, real email or migration against an existing database occurred. `D:\vetthevat-backup` was not modified.

## Provider and storage

- Firebase Authentication emulator from the installed Firebase CLI **15.15.0**, fixed project **demo-vetthevat-auth**, bound to **127.0.0.1:9099**. The `demo-` prefix is Firebase's isolated project convention; it is not a demo login or guest authorization path.
- Firebase Admin SDK **14.5.0** and Web SDK **12.14.0**, pinned for the installed Node **22.15.1** runtime. Compatible app/app-compat components are pinned to **0.14.13 / 0.5.13** so npm cannot resolve their Node-24-only versions.
- A **new, dedicated SQLite database** at `.auth-dev/auth.sqlite`, using Node's built-in `node:sqlite`. This implements `WritableWebSessions`, `AdminAccessStore` and `AtomicRateLimitStore`. It is a single-machine development store, not a Vercel persistence solution or production adapter.
- Store creation uses exclusive `wx` creation and initializes tables only in a new file. Reinitializing an existing file is refused. Runtime opens only an initialized matching project/schema version. No draft PostgreSQL migration or existing database schema was applied.
- SQLite transactions use `BEGIN IMMEDIATE`, WAL and `synchronous=FULL`; grants, session hashes, per-session revocation, expiry and rate buckets persist on disk. Grant removal atomically revokes that UID's existing sessions. Registration atomically checks an active project+UID grant and unique cookie/session identifiers.
- `.auth-dev` is ignored by Git/Vercel and outside public assets. Windows permissions were explicitly verified to retain only the operator, SYSTEM, administrators and task sandbox identities. Broad Users/Authenticated Users access was removed from the new directory. Runtime config, TLS key, emulator exports, test passwords and private logs are not report artifacts.

The provider follows [Firebase's emulator integration](https://firebase.google.com/docs/emulator-suite/connect_auth) and [server session-cookie guidance](https://firebase.google.com/docs/auth/admin/manage-cookies). **Emulator tokens and session JWTs are unsigned by design.** These results verify real SDK/emulator/service integration, password checks and application session enforcement; they do not prove production cryptographic signature verification or ownership of the real email mailbox. Email verification used the emulator's actual OOB verification flow, with no real mail sent. Keep this service on a trusted local workstation, never exposed through a tunnel or public interface.

## Runtime and session behavior

`lib/server/admin-services.ts` now installs real development services when all validation passes. It does not discover cloud credentials or fall back to a production Firebase project. Enabling requires `VTV_DEV_AUTH=1`, `VETTHEVAT_ENV=test/development`, the exact loopback emulator/project, a valid initialized private configuration and the exact **https://localhost:3443** origin. Any `VERCEL` variable, production environment selection, cloud credential path, remote emulator, wrong project or redirected configuration/store path is rejected. Ordinary builds remain unavailable for authentication.

The dedicated HTTPS server binds **127.0.0.1:3443**, checks the exact Host, terminates TLS itself and replaces caller-supplied forwarding metadata. The self-signed localhost certificate is generated locally; no system trust store was changed. Browser tests trusted only that certificate's SPKI in their temporary Chrome profile. Manual browsers may require accepting the local certificate warning.

The login interface retains the existing branding/layout and adds email/password validation, safe provider errors and secure token exchange. Firebase Web persistence is **in-memory only**. It sends credentials to the local provider and only a recent ID token to the existing same-origin session endpoint. It signs out the Web SDK after exchange; tokens and roles are not placed in localStorage/sessionStorage.

Server exchange verifies issuer/audience/project, expiry, recent authentication, verified email, revocation/disabled-user state through the SDK, and an active persisted project+UID administrator grant. It registers the session durably before returning a **Secure, HttpOnly, SameSite=Strict, host-only** five-day cookie. Each web session has a random nonce envelope around the provider cookie so same-second SDK cookie issuance cannot collapse two browser sessions; the entire envelope is hashed in SQLite, and the inner JWT is re-verified by Firebase on every guarded operation.

GET `/api/auth/session` re-verifies provider, durable registry, expiry and live UID grant and returns a session-bound CSRF token. It does not silently extend the five-day lifetime. Logout requires same-origin/CSRF checks and confirmed durable revocation before cookie clearing. It revokes only the current web session, preserving another valid session. The client checks on focus/pageshow/visibility and periodically; denied/expired sessions leave the workspace and show a sign-in explanation. Verification failures hide the workspace while displaying a retry error. Password management, MFA, bulk session inventory and general tenant-user access remain unimplemented.

The shared durable limiter protects the application token-exchange endpoint, including invalid tokens. Password attempts go directly to the local Auth emulator; production provider password throttling/MFA/bot policies are separate deployment work and are not established by this development test.

## Identity and administrator grant setup

The intended administrator is **admin@vetthevat.com**. Authorization is persisted by the emulator's verified **UID + project**, never by email, a browser role or a local Team entry. No password is hardcoded, prefilled or printed. Nothing creates an account, grant, company or financial record on application startup.

For a **fresh isolated environment**, from `D:\vetthevat`:

1. `npm ci --ignore-scripts --no-audit --no-fund` (requires Node >=22.15 and the pinned lockfile). Firebase CLI 15.15.0 must be installed; `VTV_FIREBASE_CLI` can point to its `firebase.js`. The existing installation was used here.
2. `npm run auth:dev:init` creates a **new** private SQLite store/configuration and a 30-day self-signed localhost certificate. It refuses existing store/config/key files rather than overwriting or migrating them. Windows ACL setup uses `icacls` only on `.auth-dev`. OpenSSL defaults to Git for Windows' `mingw64/bin/openssl.exe`; set `VTV_DEV_OPENSSL` to another trusted local executable if needed. `--certificate-only` can create missing certificate files without altering an existing store/configuration; it also refuses existing certificate/key files.
3. In one terminal: `npm run auth:dev:emulator`. Its CLI configuration is isolated under `.auth-dev/cli-config`; it does not read the operator's logged-in Firebase CLI profile. Existing local exports are imported automatically. Auth, hub and logging ports are all explicitly loopback; the emulator UI is disabled.
4. Set `VTV_DEV_ACCOUNT_PASSWORD` **privately for the operator process**, with a user-chosen 12–128 character password. Run `npm run auth:dev:account -- create`, then unset the password variable. This creates only the intended email, initially unverified, without a grant; it refuses an existing email instead of resetting its password. Never put a password in command arguments, a committed file or a report.
5. `npm run auth:dev:account -- inspect` reports the UID and local verification state. `npm run auth:dev:account -- verification-link <UID>` prints a strictly local emulator verification link; open it to complete the emulated verification. No real mailbox ownership or real email delivery is asserted.
6. `npm run auth:dev:account -- grant <verified UID>` verifies that the local user is enabled, verified and belongs to the intended administrator email before recording the UID grant. `revoke <UID>` removes that grant and revokes the UID's web sessions. There is no HTTP grant/bootstrap endpoint.
7. `npm run auth:dev:build`, then `npm run auth:dev:start`. Visit **https://localhost:3443/login** and enter the development account's actual password. The dev build is necessary for the exact loopback emulator CSP allowance. Ordinary `npm run build` omits that allowance and keeps default authentication unavailable.
8. Before stopping/restarting the emulator, `npm run auth:dev:export` explicitly persists its identities/configuration under `.auth-dev/emulator`. Startup also requests export on graceful shutdown. Abrupt process termination need not export, so use the explicit command when preserving identities matters.

At delivery, the HTTPS application and emulator are running on loopback. Use the existing services rather than starting a second instance on the same ports. The final `.next` output is the isolated development build; use the documented dev build/start commands after stopping it.

For **this verified checkout**, the integration runner created test-owned local identities with cryptographically random passwords and completed local OOB verification/grants. Their passwords are retained only in the ACL-protected, ignored `.auth-dev/integration-accounts.json` for repeatable tests; inspect that file privately if manually signing in to the test account. Do not paste its contents into tickets/chat, reuse those passwords for production, or treat the secondary test administrator as a business user. The test runner refuses an existing administrator identity it does not own and never resets an operator's password.

The dev server scripts set environment values in their own process/children. They do not edit `.env.local`, the actual Vercel environment, Firebase project settings or global credential configuration. Leave `VTV_DEV_AUTH=0` and the marketing gate enabled in deployment templates. There is **no production activation flag or approved production service implementation** in this milestone.

## Private pages and data isolation

Actual authenticated Chrome navigation succeeded for:

| Module | Route | Verified outcome |
| --- | --- | --- |
| Dashboard | `/app/dashboard` | Existing UI rendered after explicit account-local company creation. |
| Invoices | `/app/invoices` | Existing empty list and Purchase/Sale direction workflow entry accessible. No financial records seeded. |
| Customers | `/app/customers` | Existing UI accessible for the signed-in account's isolated workspace. |
| Suppliers | `/app/suppliers` | Existing UI accessible. |
| Banking | `/app/banking` | Existing local interface accessible; no live bank feed. |
| Reports | `/app/reports` | Existing empty reporting interface accessible. |
| ORS | `/app/ors` | Route opens; its honest service/entitlement setup-required state remains. |
| Settings | `/app/settings` | Existing interface accessible; copy distinguishes working development authentication from unavailable production/password/MFA services. |
| Subscriptions | `/app/subscription` | Route opens; billing/usage remains explicitly unconnected. |
| Admin leads | `/app/admin/leads` | Protected management UI opens. API reports service unavailable because lead persistence is disabled; no lead data is loaded. |

`AppStateProvider` now requires a server-derived HMAC namespace tied to the verified project/UID. All hydration, financial writes and recovery snapshots use that namespace. There is no read/fallback/import of `vet-the-vat-workspace-v1` or unscoped legacy recovery data. The provider remounts on namespace change. The namespace segregates local development records; it is not a backend authorization credential or secure production financial database.

The real browser test explicitly created company A for administrator A, signed out, signed in as a second independently verified/granted UID, saw an empty workspace and created company B. Returning to A restored only A's records. The old unscoped workspace's exact synthetic bytes remained unchanged. These checks used a fresh temporary browser profile; the actual user's browser records were not inspected or modified. Test companies were created through explicit UI actions; no application startup demo company or fake invoices were introduced.

All financial APIs, including `/api/stage1/*`, remain disabled even for a valid administrator. No server company capabilities, production financial persistence, legacy ownership migration, private durable original storage, real bank integration, ORS service or paid subscription backend was enabled.

## Real integration verification versus unit tests

The separate integration commands use the actual Auth emulator, Firebase Admin SDK, SQLite file and Next HTTPS handlers. **They do not intercept provider traffic or install test doubles into runtime resolvers.**

- `npm test`: **166 passed, 0 failed**. Includes the existing unit/domain tests and four new real-SQLite/config/namespace tests. Prior injected provider tests remain identified as unit tests.
- `npm run typecheck`: passed.
- Ordinary `npm run build`: passed with dev authentication disabled; default browser checks confirmed public access, setup-only login and private rejection.
- `npm run auth:dev:build`: passed with the exact isolated configuration.
- `npm run test:auth:integration`: real-provider password rejection; unverified email rejection; malformed token rejection; verified UID without grant rejected; acknowledged durable session registration; independent-process session reopen; refresh; direct dashboard access; disabled financial APIs; unauthenticated admin denial; missing-CSRF/cross-origin logout rejection; session-specific revocation and replay denial; removed grant revocation; expired SQLite session; persistent 429/Retry-After. Private config/key/store URLs return 404 and the login HTML does not serialize the server secret.
- `npm run test:auth:browser`: real Web SDK login and clear errors; 390/1440 widths; all ten requested protected module routes; refresh/direct navigation; actual UI logout and replay rejection; two-UID isolation; legacy bytes unchanged; expiry and removed-grant redirects. No auth tokens/roles in localStorage; the session cookie is Secure/HttpOnly.
- Default `--routing-only` browser regression: nine requested public routes in both modes, 25 private paths under absent/forged/duplicate-cookie variants, private API rejection, setup-only login and no browser-auth bypass with dev mode off.
- Existing `--leads-only` regression: 15 public pages and enquiry form behavior passed using its explicitly synthetic provider responses. This does not establish real lead persistence/email delivery.
- Build artifact scan: no checked demo financial markers, demo entry points or test fixture traces. Exact final count is recorded in the verification JSON.
- Screenshots `docs/previews/milestone-4a/dashboard-390.png` and `dashboard-1440.png` show real authenticated development pages with zero seeded financial records. Mobile screenshot was visually inspected.

The integration runner operates only the dedicated test store and owned identities. It temporarily expires a test session and removes/restores a test UID grant, then exercises login limits. Its rerun setup refuses unknown active grants before resetting only login rate buckets. These are test-data DML operations in the new isolated store, not schema migrations or production access.

### Restart findings

The SQLite session/grant survived an independent process reopen. A valid provider session was also reverified after an **application-only restart** without another password sign-in.

Firebase emulator export/import preserves identities but resets its token-valid-after time. A cookie minted before import was therefore correctly rejected by SDK revocation checking, even though the registry and grant remained durable. A fresh password sign-in worked after import. Revocation checks were **not weakened** to preserve those older cookies. Emulator restart/import requires signing in again; this is not a production session-continuity claim.

### Dependency security findings

The build surfaced a confirmed vulnerability in the pre-existing Next.js 16.4.0. Applied a local patch to **Next.js 16.4.2**, covering the published [image optimization vulnerability](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) and [App Router denial-of-service advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r). Also pinned transitive **@grpc/grpc-js 1.14.6** to address [its authentication-context advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j). No unattended upgrade agent, major framework migration or deployment was run. Installed Next.js guides were reread after patching.

`npm audit --omit=dev` now reports **0 findings** at the recorded snapshot. The full audit still reports **5 existing high build-toolchain findings** through Tailwind 3 / braces / micromatch / fast-glob / chokidar. The suggested Tailwind 4 migration affects the frontend toolchain and is outside this authentication milestone; it remains a separate release review/upgrade requirement. A clean runtime audit is not a claim that all dependencies or the product are production-ready.

Some Node/Next/Chrome commands required approved child-process execution after sandbox `EPERM`. Initial Windows ACL attempts were insufficient or rejected by OS privilege checks; the final scoped `icacls` implementation succeeded and was verified. OpenSSL's `usr/bin` executable lacked a DLL, so the working Git `mingw64/bin` executable is used. No automatic permission review rejected an action, and no production approval was inferred from a successful local test.

## Remaining production approval boundaries

1. Approved real Firebase project/provider, web domains, verified real administrator UID, mailbox/MFA/security policies and server credentials. Production Firebase was not accessed; emulator unsigned-token testing cannot validate production signing keys or account ownership.
2. Approved durable managed production grant/session/rate-limit storage, schema/least-privilege/revocation/audit/backup policies and separately authorized migrations. Do not place this SQLite file on Vercel or reuse the lead runtime role for authentication/finance.
3. Production runtime adapters and CSP/origin/TLS configuration, provider abuse controls, CSRF/session lifecycle/recovery testing and explicit identity/authorization review. The current runtime intentionally rejects production/Vercel activation.
4. Server company membership/capability integration, financial DAL/API persistence, original document storage and explicit legacy-record ownership/import approval. Until then financial APIs stay disabled; local account segregation is not a substitute for server tenancy.
5. Real lead database access, ORS entitlements/services, subscription/billing services, operational monitoring, retention and the separate build-toolchain dependency upgrade.
6. Real isolated test-project end-to-end verification of production-style signed tokens and the final deployment configuration, followed by explicit deployment approval. No automatic deployment is authorized or performed.

Exact source/config/test/report file paths and SHA-256 hashes are in `milestone-4a-development-auth-change-inventory.json`. Runtime secrets/state and test execution logs remain excluded. The report does not claim the full financial application or production authentication is operational.

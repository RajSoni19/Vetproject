> Current status (23 October 2026): web authentication now uses PostgreSQL. See [PostgreSQL authentication results](postgresql-web-auth-results.md). The provider/setup claims below are historical and superseded.

# Application route restoration and authentication preparation

Update: isolated Firebase emulator + SQLite authentication is now implemented and verified. See [Milestone 4A development authentication results](milestone-4a-development-auth-results.md). The production restrictions and financial-backend limitations below still apply.

22 October 2026. **The full application is not operational.** Public pages and login setup are available locally. Real Firebase login, durable web sessions, administrator authorization and authenticated browser workflows have not been verified. The safe fallback explicitly allowed in the request remains active. Nothing was deployed, no database migration ran, no real email was sent, and production Firebase, Flutter, PostgreSQL and the immutable backup were not modified.

This report supersedes the routing/packaging descriptions in the historical administrator-authentication and temporary marketing-launch reports. It does not supersede their unresolved backend requirements.

## 1. Root causes and route investigation

| Route or component | Why inaccessible before this change | Current result |
| --- | --- | --- |
| All `/app/*` paths, including dashboard, invoices, upload/review, customers, suppliers, banking, VAT, reports, ORS, settings, subscriptions and admin | `proxy.ts` unconditionally redirected every private page, including a potentially valid session | Prepared server-verification path. Missing/invalid sessions redirect; verified identity + durable registry + active administrator grant can pass the routing policy. Real runtime services remain unconfigured. |
| `/app` | Its page redirects to `/app/dashboard`, but Proxy denied it before rendering | Same secure session gate as other application paths. |
| `app/app/layout.tsx` | Independently calls `requireAdministrator()`, whose service resolver always returned undefined | Retained. Service resolver moved to `admin-services.ts`; no browser role or deployment flag installs authentication. |
| Login and identity setup routes | `.vercelignore` excluded sources; `VETTHEVAT_MARKETING_ONLY=1` returned 404 even for login | Sources included; GET/HEAD setup pages remain accessible in either mode. They collect no credentials. |
| Vercel application routes | `.vercelignore` excluded `app/app`, identity pages, most APIs and server modules | Full source packaging prepared. Existing marketing gate remains available and defaults to 1 in the template. No deployment performed. |
| `/api/admin/leads` | Proxy rejected requests; handler also required verified administrator services | Proxy allows only server-authorized requests in application mode; handler independently repeats identity/grant/CSRF checks. Unconfigured services keep data inaccessible. |
| `/api/stage1/*` and unknown private APIs | No installed real dependencies; Stage 1 handler is explicitly `createStage1Api(undefined)` | Still denied, even for a future signed-in administrator. Signing in must not silently enable financial APIs without company authorization/DAL integration. |
| `/api/auth/session`, `/api/auth/logout` | No route handlers, only unavailable Proxy responses | Handlers prepared. They fail closed until reviewed real services are installed. Unsupported methods are rejected. |

There are no parenthesized route groups separating these routes. The public pages use `PublicShell`; the workspace lives under the literal `/app` segment with its own server layout. No rewrite, base-path or custom redirect in `vercel.json`/`next.config.ts` caused the outage. The proxy matcher excludes public marketing pages and static assets.

Firebase investigation covered `identity.ts`, `auth-preparation.ts`, `admin-auth-core.ts`, `stage1/security.ts`, backend configuration validation, package dependencies and previous Firebase prerequisites. The existing Firebase adapter accepts an explicitly supplied Admin SDK instance; no Firebase SDK is installed, no instance is initialized, and no durable administrator/session implementation exists. The API client contracts do not establish identity. Actual private environment values were not printed or used to connect to services.

## 2. Delivered changes

- Proxy now delegates private routing to a testable server policy with no cookie-presence/role/header bypass. Every protected page still has the server layout check; admin lead handlers repeat authorization. Denied responses are non-cacheable.
- A verified session can pass the prepared routing path; inactive or missing UID grants receive 403. A missing/forged session redirects to login; private APIs reject access. Unknown financial APIs remain blocked.
- The administrator Firebase verifier calls SDK `verifySessionCookie(cookie, true)` and checks project/audience/issuer, verified email, identity and expiry; it binds the result to the durable web session registry. SDK signature/revocation/disabled-user checking must come from the reviewed real SDK, not this project's test substitutes.
- Token exchange requires exact approved HTTPS origin, same-origin browser metadata, bounded JSON and a recent verified ID token, shared rate limits and a persisted active administrator grant. It creates a five-day secure HttpOnly host-only SameSite=Strict cookie only after acknowledged durable registry registration and another server verification. A failed/unknown commit emits no browser session cookie. Registration must atomically recheck the active grant.
- Session GET re-verifies the provider, registry and grant, and returns only authentication status plus an HMAC-bound CSRF token. Logout requires origin/CSRF checks and confirmed durable web-session revocation before clearing the cookie. It never calls global Firebase refresh-token revocation or changes Flutter sessions.
- Runtime auth and login service resolvers intentionally remain undefined. There is no real credential form, fake login, guest identity, hardcoded password, public bootstrap endpoint or environment-only bypass. The token exchange does not accept email/password JSON.
- Public desktop/mobile navigation now includes Sign in; footer includes Privacy and Terms. Every Get Started link remains an enquiry link. Workspace navigation includes the existing protected lead interface.
- Packaging includes protected frontend/backend sources while excluding private env/config, key material, local data, migrations, tests and reports. Including source does not authorize a request or make a handler operational.

The session design follows the [Firebase session-cookie guidance](https://firebase.google.com/docs/auth/admin/manage-cookies) and [Firebase ID-token verification requirements](https://firebase.google.com/docs/auth/admin/verify-id-tokens). Installed Next.js authentication, Proxy and cookies guides were read before changes. No credentials/provider calls were needed to consult documentation.

## 3. Working public routes

Verified HTTP 200 locally in both application and marketing modes: `/`, `/about`, `/features`, `/pricing`, `/contact`, `/support`, `/get-started`, `/privacy`, `/terms`. All nine were checked in Chrome at 390 and 1440 pixels; Sign in navigation works in desktop and mobile menus. `/login` renders the honest setup-required page in both modes, with no password input. Existing additional marketing routes are covered by the Get Started regression.

Get Started storage/email configuration remains separately gated; HTTP 200 for the form does not establish successful lead storage or real email delivery.

## 4. Authenticated routes and limitations

**Real working authenticated routes: none verified.** No actual Firebase account/session was used. Tests of successful token exchange, refresh, route authorization and logout use isolated provider/store doubles injected directly into the actual functions, never installed in live runtime resolvers. Do not interpret these as end-to-end Firebase or PostgreSQL verification.

The successful routing policy was exercised for `/app`, dashboard, invoices (purchase/sales share `/app/invoices`, with an existing Invoice direction filter), new/upload/detail, customers, suppliers, banking, VAT, reports, ORS, settings, subscription, admin and admin leads. The browser verified rejection of 25 private paths with no cookie, forged cookie/role plus RSC/prefetch, and duplicate cookies.

All workspace routes currently require software-administrator authorization; ordinary tenant/company users are not enabled. Do not substitute a company Admin role for a software-administrator grant. Company roles/capabilities and memberships must be wired independently before general user access.

Preserved frontend limitations: finance records remain browser-local with no verified UID/company ownership binding; originals may be session-only; ORS is an explicit unavailable state; subscription/billing controls are unconnected. No demo company or financial records were introduced. No existing user records were migrated, cleared or exposed through the gate. A new authenticated account must not automatically inherit another account's old browser-local workspace.

## 5. Exact authentication setup requirements

This is an integration task, not an environment-variable-only activation:

1. Privately confirm the approved Firebase project ID, ownership, web app/auth domain and enabled provider. Use a separate approved test project or isolated local emulator first. Do not connect the published app's production project under this task. Review/pin the compatible Firebase Web and Admin SDK versions before installing them.
2. Privately identify the Firebase UID belonging to **admin@vetthevat.com** and verify account/email ownership. The email is the intended enrolment target, never a role check. Do not reset an existing password, create a production identity, change provider settings or grant a role without separate authorization. Never supply a private key/password in a report or chat.
3. Select/approve an isolated durable store and implement `WritableWebSessions`, `AdminAccessStore` and `AtomicRateLimitStore`: server-clock expiry, unique cookie hashes/session IDs, durable revocation, transactional grant check at registration, active grant checks on every operation, restricted runtime permissions, no public listing. No migration was authorized or executed. The existing lead database role must not be reused to access financial/authentication data.
4. Implement the two resolvers in `lib/server/admin-services.ts` using an explicitly reviewed Firebase Admin Auth instance, the real session/grant/limiter adapters and `administratorFirebaseVerifier`. Both resolvers must use the same project, origin, CSRF secret and stores. There is no built-in SDK initializer or runtime database implementation for these ports.
5. Wire a real login UI only after those services are ready. Firebase Web sign-in should use in-memory persistence, obtain a recent ID token, POST only `{idToken}` to `/api/auth/session`, clear client Firebase credentials after the server session is established, then visit the fixed `/app/dashboard` destination. Do not persist auth/refresh tokens or roles in localStorage. Add the minimum reviewed Firebase endpoints to CSP; the current CSP deliberately has no Firebase allowlist. Do not use wildcard CSP rules.
6. Wire a logout control to POST `/api/auth/logout` with the session GET's `x-csrf-token`. Only navigate to login after durable revocation succeeds. Confirm refresh, cross-tab behavior, no cached private content on sign-out, expired/disabled/revoked users, CSRF failures, rate limits, grant removal, token exchange failure, and replay using real isolated services.
7. Approve safe ownership mapping for existing browser-local records and the server company membership/capability integration. Until then keep the runtime services unavailable; do not expose browser-local financial records to newly authenticated accounts. Connect the financial DAL and each API's company authorization before selectively enabling Stage 1 routes.
8. Verify ORS entitlements/services, subscription services, private original storage, audit requirements and administrator lead storage separately. Their frontend routes alone do not establish working integrations.

Environment preparation (existing template names unless stated):

| Setting | Requirement |
| --- | --- |
| `VETTHEVAT_MARKETING_ONLY` | Template now sets `1`; login setup remains reachable. Set `0` only in the approved isolated application test environment, then production only after end-to-end verification/explicit deployment approval. `0` alone never enables login. |
| `VETTHEVAT_ENV` | Explicit environment selection for existing backend validator. |
| `FIREBASE_PROJECT_ID` | Exact isolated or explicitly approved project; must match all token/session issuer and audience checks. |
| `FIREBASE_ADMIN_AUTH_MODE` | Existing validator supports local emulator, application-default or private credential-file modes under its environment restrictions. No runtime SDK initialization is wired yet. |
| `FIREBASE_AUTH_EMULATOR_HOST` | Explicit loopback only for local test configuration, with a `demo-` project. Never set for production; emulator use is a test identity service, never a guest login fallback. |
| `FIREBASE_ADMIN_CREDENTIALS_FILE` | Server-only approved private absolute path if that mode is selected. Do not place credential JSON in source/public assets. For Vercel approve a platform-appropriate server identity mechanism; no service account was uploaded. |
| `FIREBASE_PRODUCTION_PROJECT_APPROVED` | Existing production validator requires exact project match; not approval to connect under this task. |
| `PG_RUNTIME_*`, `PG_PRODUCTION_DATABASE_APPROVED` | Existing backend template holds restricted target/TLS/pool settings. Supplying them does not install the missing session/grant adapters or execute migrations. Production remains untouched. |
| Approved exact HTTPS origin, CSRF secret, review reference | Required by injected auth dependencies; **no environment loader or new env variable names invented for these**. Add a validated server-only loader during the approved runtime integration. Use a separate random 32+ character secret. |
| Firebase public web config and limiter connection | Must be supplied through the approved integration once provider/SDK/storage are selected. No current runtime environment switches exist to wire them. Public web config must never contain Admin credentials. |
| `LEADS_*` | Existing separate lead-system configuration is unchanged; real persistence and mail remain unverified. |

## 6. Vercel changes and release boundary

`.vercelignore` no longer omits `app/app`, identity pages, API handlers or `lib/server`. It still excludes database/migration files, secrets and private local state. `vercel.json` build/install commands are unchanged. The local production build lists the protected application routes, login and new auth handlers.

Keep deployment paused operationally: no Vercel command was issued and no live environment was changed. Do not change the existing live marketing flag or deploy this source until the approved identity/session/grant adapters, financial data ownership, sensitive API checks and real isolated browser flows pass. After that, an owner can explicitly approve a full application deployment with the reviewed configuration. Source packaging fixes a missing-build-input problem; it does not prove deployment readiness.

## 7. Validation

- `npm test`: **162 passed, 0 failed**. Existing domain tests plus new routing/session tests cover verified identity/UID grant/durable registration, invalid/unverified/stale/wrong-project tokens, raw-password rejection, refreshed verification, CSRF/logout/replay, revoked grants, duplicate cookies, origin/rate limits and failed persistence. Provider/store success uses isolated doubles.
- `npm run typecheck`: passed.
- `npm run build`: passed; public and private routes plus auth/admin/lead/Stage 1 handlers appear in the build manifest. Real providers are never initialized by this build.
- `node tests/verify-cleanup-build.cjs`: **927 served build artifacts inspected**, no checked demo/business fixtures or traced test fixtures.
- `node tests/browser-invoices.cjs --routing-only`: passed with isolated Chrome at 390/1440; nine requested public routes in both modes, desktop/mobile sign-in, 25 private paths under three attack/session variants, protected API methods, session/logout unavailability, no localStorage auth bypass and no financial workspace rendered publicly. Login remains 200 in marketing mode; private APIs/pages return 404 there.
- The production build and Node test workers needed sandbox-approved child-process execution after `spawn EPERM`. A browser assertion initially exposed an incorrect 503 for unconfigured forged-cookie private API requests; corrected to the intended 401 and reran the checks successfully. No permission review rejected an action.
- `docs/previews/auth-restoration/login-390.png` and `login-1440.png` show the actual unconfigured state; mobile screenshot visually inspected. These are not successful-login screenshots.

`node tests/browser-invoices.cjs --leads-only` also passed: 15 existing public pages, desktop/mobile Get Started navigation, accessible form/validation, failure/synthetic confirmation, duplicate protection and admin/worker boundaries. Provider responses were intercepted; no real lead storage or email was verified. Authenticated browser tests, real provider verification, real durable registry/revocation, migrations, production financial APIs, ORS, subscriptions, original storage and live Vercel behavior remain unverified.

## 8. Exact changed files

Machine-readable file list and SHA-256 hashes: `application-auth-restoration-change-inventory.json`. It includes the report, verification JSON, new screenshots and all edited/added source/tests; generated `.next` files and ignored local execution logs are excluded. No package or dependency lockfile changed. There is no Git repository, so this is a task inventory rather than a Git diff.

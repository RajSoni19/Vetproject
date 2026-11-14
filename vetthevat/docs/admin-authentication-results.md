# Administrator authentication: demo removal and fail-closed preparation

20 October 2026. **Authentication is not operational.** Implemented the safe fallback explicitly requested when persistence/session infrastructure is unavailable. No administrator account, password, Firebase session or successful login was created. No SDK installed, database connection/migration, production Firebase/Flutter change, payment, email or deployment. The immutable backup was not touched.

## Findings and architecture decision

The actual `app/login/page.tsx` accepted arbitrary nonempty inputs and pushed `/app/dashboard`; its Enter Demo button bypassed even those inputs. Register and the shared reset/verification/onboarding component also simulated success. `app/app/layout.tsx` mounted browser-local state without a server session check. These were verified source defects, not stale-label assumptions.

Inspected `lib/api/*`, `lib/server/identity.ts`, `auth-preparation.ts`, configuration/dependency files, Firebase prerequisites and Milestone 4A authentication plans, plus the installed Next authentication/Proxy/cookie guides. The Android API adapter is only a contract client; it does not supply verified web authentication. Firebase verifier, membership, session and shared-rate-limit ports have no installed real adapters. No Firebase SDK is installed. PostgreSQL identity/session/admin tables and write permissions have not been applied or verified. Environment values were neither printed nor used to force a connection.

Selected **conditional architecture**: reuse Firebase Authentication for identity after approved project ownership/configuration is verified, and maintain web administrator grants plus per-web-session revocation in server-side PostgreSQL storage. Do not create a parallel local password database. Map identity using verified `(Firebase project, UID)` and a persisted administrator grant; email, company Owner/Admin labels, Firebase client claims and localStorage cannot confer software-administrator privileges. A company administrator is not automatically a global administrator.

This retains the published Flutter identity system without changing its code, providers, custom claims or global refresh-token state. Web logout must invalidate only the web session. The existing [Firebase session-cookie documentation](https://firebase.google.com/docs/auth/admin/manage-cookies) and [token-verification documentation](https://firebase.google.com/docs/auth/admin/verify-id-tokens) support the integration direction; they do not establish access to the owner's Firebase project or prove that integration works here.

## Delivered behaviour

- Login, registration, reset, verification and onboarding render accurate setup/unavailable states. No password field, credential collection, fake success toast, demo navigation or default administrator is present.
- `proxy.ts` denies all `/app/*` traffic before page/prefetch/RSC rendering, even when cookies, roles, Authorization headers or middleware-bypass headers are forged. Private responses are non-cacheable. API traffic is denied; auth-prefix requests return the same unavailable response without inspecting credentials. These are denial responses, not enabled login/logout/bootstrap endpoints.
- Workspace server layout independently calls the server-only administrator guard. Its service resolver returns `undefined`; no environment flag, email allowlist or browser state can switch on access. All protected workspace features remain in source but unavailable until real services and ownership/import boundaries are approved.
- `.dockerignore` now includes the request-gate source in its allowlist so a future container build cannot silently omit it. No container or deployment was executed.
- Added contracts for verified Firebase sessions, hash-indexed web-session registry, active server administrator grants, expiry/revocation checks, CSRF-protected durable web logout, shared atomic login rate buckets and uniform public credential errors. The concrete service adapters remain absent.
- Logout contracts return a `__Host-` cookie-expiry descriptor with HttpOnly, Secure, SameSite=Strict and Path=/ only after durable web-session revocation succeeds. No live session cookie is issued or invalidated by this pass. A failed registry write must not masquerade as successful logout.
- Login rate policy proposal: 20 attempts per network bucket and 5 per account bucket per 15 minutes, using a shared atomic store and server-derived/HMAC bucket identifiers. No operational limiter is claimed. Trusted proxy/IP rules, policy approval, anonymous login-CSRF challenge, provider timing/enumeration handling, MFA and monitoring remain integration gates.

## Initial administrator password and bootstrap

Enrollment target supplied by the owner: **admin@vetthevat.com**. This is a future operator enrollment target, **not an account that exists, an email-based authorization rule or a default login**. The target is not embedded in client JavaScript; the build scan found zero occurrences in browser chunks.

The password is **not initialized**. Prompting for a real password now would collect credentials without a verified provider or secure persistence path, so no prompt or password file was created. There is no executable provisioning CLI or HTTP bootstrap endpoint pretending to work. `LocalAdministratorBootstrap` is a local-operator integration contract only.

After the missing infrastructure is separately approved and implemented, the one-time local bootstrap must:

1. Verify the approved project/environment, private operator access, identity provider and restricted persistence. Refuse production targets or existing enrollment unless explicitly authorized for that environment.
2. Check a durable one-time bootstrap marker and existing identity/grant state. Do not silently reset or replace any existing Firebase user, especially one used by Flutter.
3. Prompt privately in the operator terminal without echo, command arguments, environment variables, shell history or logs. Confirm the password privately; keep it transient and never serialize it.
4. Provision through the approved identity provider. The app does not store passwords. Verify the provider's password-hashing/security policy; **no claim of Argon2id or a verified password hash is made here**. If an independent administrator password store is later selected instead, that requires a separate reviewed design using Argon2id or an appropriate approved modern hash, not plaintext or ad-hoc JSON credentials.
5. Resolve and independently verify the exact project+UID. Atomically consume the one-time marker and create the persisted web-admin grant and audit event. Provider account creation and PostgreSQL grants are not one distributed transaction: a failed grant must leave no administrator access, with explicit reviewed recovery rather than unsafe auto-retries.
6. Reject repeat bootstrap/concurrent claims, never return a password/token, and verify login/session/authorization/logout end to end using synthetic local/test infrastructure before any live activation.

No SQL or provider actions in this proposed process have been executed. Secrets must be supplied through approved private configuration, not chat or source.

## Demo data and plan-route correction

Browser-local data was not cleared, exported, migrated or auto-deleted. The new gate prevents AppState mounting in unauthenticated requests. Fresh-profile checks observe no workspace storage key and no sample business. Synthetic pre-existing workspace JSON remains byte-for-byte unchanged across denied navigation and refresh; localStorage role flags grant no access. Conservative legacy cleanup and explicit review/recovery remain in source for later authorized access, and ambiguous records are not silently removed.

Removed stale demo-only auth copy and changed the dormant workspace shell to accurate browser-storage/backend-setup wording. Financial, OCR, tax-classification, local persistence and pricing logic are preserved.

Current checkout already used the shared Basic/Starter/Growth catalogue on `/app/subscription`; no Starter/Business/Scale pricing component or “limits to be confirmed” pricing text was found in current application source. The reported old-plan screenshot cannot be attributed conclusively without its connected tab/server/build. A stale local process/build or different checkout is possible, not verified. There is no project service-worker registration explaining the old screen in inspected app source.

- `/app/subscription`: existing private usage/settings route, correctly denied while authentication is unconfigured. Its source continues to use the central catalogue.
- `/plan-information`: new public information-only route linked directly from the replacement login screen. Reuses `ProposedPlanInformation` and `lib/plan-catalog.ts`.
- `/pricing`: same shared component/catalogue.

The tested public routes show Basic £9/30 invoices/2 companies/owner+1/optional ORS £5, Starter £15/100/2/owner+3/ORS included, Growth £25/300/3/owner+5/ORS included. Basic+ORS is £14. No selections activate access or payments. Information about unconnected billing remains accurate rather than implying a real subscription.

To view this source's result, restart the existing local app process from `D:\vetthevat` if it is serving an older build, then reload. Do not clear browser site data. The expected login heading is “Administrator sign-in” with “Secure setup required”, not a demo entry. The owner's existing browser profile remains inaccessible to current connected tooling; no claim is made that its old tab was independently replaced or verified.

## Tests and actual limits

| Validation | Actual result |
| --- | --- |
| `npm run typecheck` | Passed on final source. |
| `npm run build` | Passed on final source; workspace routes are dynamic and the Proxy is included. |
| `npm test` | **99 passed, 0 failed**, including existing financial/report/export/cleanup suites and five new admin contract/static test cases. |
| `node tests/browser-invoices.cjs --admin-auth-only` | Passed against the final localhost build, no uncaught page exceptions: private page/direct URL/refresh denial, forged cookie/role/middleware-header denial, RSC/prefetch denial, unauthorized API rejection, identical unavailable responses for different credential identifiers, no session issuance, denied logout/bootstrap attempts, preserved browser workspace JSON, no seed on a fresh profile, replacement account screens and correct Plan Information/pricing at 320/390/768/1440px. |
| Successful real admin login/logout | **Not implemented or verified**; approved provider, registry and admin-grant persistence are unavailable. |
| Expiry/revocation/admin-grant/CSRF/rate-limit/logout invalidation | Passed with injected test transports and synthetic state only. No claim of real Firebase/DB enforcement. |
| Existing full workspace browser regression command | Invoked and **blocked**, exit 1 at the intentional authentication setup guard; no bypass was introduced. Not a passing full workflow run. |
| Browser bundle scan | Initial administrator enrollment email has zero occurrences in generated client JavaScript; the auth UI collects no passwords, no password is initialized, and no live session cookie is created. This is not a comprehensive secret-security certification. |
| Existing owner browser | Connected inventory again returned no apps/tabs. The reported original tab is **not independently verified**; manual server restart/refresh remains required. |

Test doubles are used only inside automated contract tests, never as live application adapters. Successful injected authorization/logout tests prove contract behaviour, not a working Firebase account or database-backed session. No lint pass is claimed; the existing `next lint` script remains unsupported and no linter was installed.

Screenshots: `docs/previews/admin-auth/setup-390.png`, `setup-1440.png`, `plans-390.png`, `plans-1440.png`, `pricing-390.png` and `pricing-1440.png`. Mobile setup and desktop Plan Information were visually inspected. Screenshots show the blocked setup state/public plan metadata, never a real authenticated administrator. Keyboard/modal/workspace workflows behind authentication still require an approved test session before rerunning.

The previous workspace UI browser suite requires access to the workspace. Running it now stops explicitly at the server authentication boundary, without a demo bypass. It must be re-run using approved synthetic identities after real authentication is configured; its old end-to-end pass is not claimed for this gated build. Domain/financial/export/unit regressions still run normally.

Remaining approval/integration requirements:

1. Approved Firebase project identity/ownership and separate safe development/emulator environment; exact SDK pins and provider access; web origins, verification/MFA policy and TLS/session lifetime.
2. Approved local PostgreSQL authentication/admin/session/bootstrap schema and restricted commands/migrations, plus real shared rate-limit and session stores, per-session revocation and backup/recovery testing. No migrations are authorized by this implementation.
3. Review and implement the private one-time operator bootstrap and password policy; independently test existing-user handling and Flutter non-impact.
4. Wire server/DAL authorization on every private API and company operation, CSRF/session rotation/anonymous login challenge, uniform provider failure handling and durable audit. Do not remove the fail-closed Proxy until these are proven. The Proxy is a gate, not sufficient authorization for future APIs.
5. Explicit ownership mapping/import approval for old browser-local records before a real authenticated workspace can display them safely.
6. Resolve the separately documented five high Tailwind build-toolchain findings. This pass does not change dependencies or waive that release blocker.

Recoverable originals and exact file hashes are listed in `admin-authentication-change-inventory.json`. No Git initialization or remote was performed. Authentication must not be described as operational or production-ready.

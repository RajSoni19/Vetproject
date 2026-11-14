# Local PostgreSQL login activation — 23 October 2026

**The fresh application is running and HTTP/real PostgreSQL checks pass. The
required desktop/mobile browser verification for the port 3000 entry is blocked,
so the full requested success condition has not yet been verified.**

## Local URL and actual server

Open `http://localhost:3000/login`. It returns a 307 redirect to
`https://localhost:3444/login`, where the real PostgreSQL login is enabled. HTTP
port 3000 never receives or forwards login POST bodies. Authentication cookies
remain Secure, HttpOnly and SameSite=Strict on the existing verified HTTPS origin.

| Item | Observed value |
| --- | --- |
| HTTP redirect launcher PID | 29308 |
| HTTPS Next.js PID | 28844 |
| Executable | `C:\Program Files\nodejs\node.exe` |
| Working directory / project | `D:\vetthevat` |
| Fresh build ID | `zVWdIl9l3iY7dahoQXka0` |
| Node runtime | Production build, local only |
| Identity environment | Isolated test |
| Database | `127.0.0.1:55440/vtv_saas_dev` |
| Cluster | `D:\vetthevat.saas-dev\cluster` |

These PIDs describe the launch in this session; they change after restarting.
Both listeners are loopback-only. No unrelated process was stopped. Initial
elevated listener inspection found only the development PostgreSQL listener on
55440 and no listener on 3000, 3001, 3443 or 3444. No Node process was returned by
the accompanying process query. Historical process working directories/builds
cannot be recovered from that empty state.

`npm run dev` and `npm run local:real` now run the guarded launcher. It refuses
occupied ports, verifies the approved database/installation and Stage A state,
builds current sources, starts the existing secure app, then opens the fixed
port 3000 redirect. It logs build identity without credentials. `npm run
dev:frontend` retains the plain Next development command for explicit frontend
work; it does not activate database authentication automatically.

No `.env.local` values were changed. Its values were not printed. The secure
launcher explicitly obtains local server-only configuration from the existing
restricted development runtime file; email, object storage and financial APIs
remain disabled. This does not change production configuration or deployment.

The HTTPS certificate is the existing local development certificate. Browser
regression tooling pins its public key; it does not establish trust in the user's
normal browser profile. A certificate warning in that profile needs a separately
managed local trust setup; no machine certificate store was changed.

## Old demo UI finding

Current `/login` already uses `WebAuthForm` and server-side PostgreSQL session
services. Searches of application/components/library code and current client
build output found none of `Enter Demo`, `demo@vetthevat.co.uk` or `Use demo mode`.
The remaining `company-demo-business` identifier is a legacy-record detection
marker, not a login or seeded account. Isolated test fixtures were preserved.

The screenshots therefore do not match the current source/build. At inspection
time there was no running port 3000 server to attribute them to. A stale/different
server or old browser content is plausible, **not proven**. The prior ordinary
Next development command also did not load the isolated authentication service
configuration; that mismatch is now addressed by the guarded default launcher.
No authentication check was disabled and no fake login was introduced.

Fresh HTTP responses were verified directly:

- `http://localhost:3000/login`: 307 to the fixed HTTPS login origin.
- HTTPS `/login`: 200, enabled email/password fields, none of the reported demo
  strings; matching build header on both listeners.
- HTTPS `/app/dashboard` without session: 307 to login.
- HTTPS `/contact`: 200, six requested fields and an explicit unavailable notice.

These checks establish server responses, not rendered browser behavior.

## Authentication and administrator setup

The real 19-scenario PostgreSQL/HTTPS Stage A suite passed again on the running
application. It verifies disposable registration/verification/password login,
invalid sessions and passwords, company permissions, RLS/isolation, revocation,
CSRF, concurrency, rollback/commit, logout and actual database restart persistence.
No authentication user or session was copied from 55439.

Read-only inspection found **zero** `admin@vetthevat.com` accounts and **zero**
administrator grants. Normal secure registration remains available; verification
is required before login. Email delivery is disabled in this isolated environment,
so verification/reset links stay in the private encrypted test outbox. Disposable
tests consume those links through operator test tooling; no verification bypass
or public outbox-reading endpoint exists.

Provisioning a real administrator still requires separate explicit authorization.
Do **not** run the older `auth:pg:bootstrap` script: it targets 55439, which is
excluded from this work. The approved future bootstrap procedure must:

1. Review a new operator command fixed to 55440, the actual cluster/installation
   UUID, and current Stage A checksums. It must refuse production/55439/VERCEL,
   an existing intended account or consumed bootstrap marker.
2. Receive a privately supplied unique password/name; hash via the existing
   Argon2 implementation. Never put a password in source, docs, logs or chat.
3. In one locked transaction create the intended identity, bind the administrator
   role by the generated **user UUID**, append bootstrap marker/audit, and require
   acknowledged COMMIT. Do not grant company authority from email/admin role.
4. Verify the email through a properly controlled one-use link, then test login,
   admin denial for ordinary users, revocation and logout on the isolated app.

No such administrator command was executed and no real administrator was created.

## Contact form and migration boundary

The existing branded Contact page now contains full name, business name, email,
enquiry category, message and required privacy consent. It preserves the existing
published support-email link without inventing an address or response promise.

Prepared code includes shared client/server validation, strict fields/lengths,
normalization, same-origin enforcement, bot/honeypot checks, per-network/global/
email limits, idempotency/deduplication hashes, parameterized PostgreSQL commands
and HTML-escaped notification content with a fixed administrator recipient.
Server errors are redacted and success requires a durable store acknowledgment.

`/api/public/contact` is an exact POST exception in Proxy but its handler returns
503 because its runtime is deliberately unconfigured. There is no environment
flag that silently enables it. The visible submit button is disabled, no message
is accepted, and no success/notification delivery is claimed.

The existing approved Stage A database has no contact-intake schema. The prepared
review SQL is `database/migrations/saas/004_public_contact.review.sql`, checksum:

```text
a8d47899caec449f7ec4be000a043952e8fd1eba73a7bfd2ea7e72d8f7d087a1
```

It creates a separate `contact_intake` schema, four FORCE RLS tables (enquiries,
submission keys, rate buckets, notification outbox), two indexes, two narrow
SECURITY DEFINER functions and restricted `vtv_contact_runtime` role. Owner is
existing NOLOGIN `vtv_saas_owner`; no table/list access goes to the new runtime,
web/business roles or PUBLIC. No existing record changes or messages are seeded.
It depends only on approved Stage A 001/002, **not** pending Stage B 003. All three
SQL files remain unexecuted/unchanged according to their existing approval state:
001/002 committed, 003/004 pending.

Before any approved execution, verify exact target/installation/checksums and
absence of schema/role, create new timestamped private custom database/role dumps
under the approved cluster's backup directory, verify archive listings/checksums,
then execute only the exact approved file in its transaction and require COMMIT.
Do not overwrite backups or retry an unknown commit. A post-commit forward fix or
fresh-target restore requires separate approval; no destructive rollback is
automatic. Archive validation is not a restore drill.

The contact runtime connection preflight/pool and durable notification claim/send/
acceptance worker remain to be wired and tested after approval. The outbox is a
durable notification intent with no actual delivery worker grant or provider
credentials. A properly configured Turnstile site/action (`contact-enquiry`) is
also required; no Cloudflare setting was changed or development bot bypass added.
Contact schema/privileges/PLpgSQL and actual persistence need real integration
tests after migration approval; offline parsing is not those tests.

## Actual checks and blocker

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Complete automated suite | **215 passed, 0 failed, 0 skipped** |
| New contact/local entry subset | Eight unit/injected/offline tests included above |
| Real PostgreSQL/HTTPS suite | **19 scenarios passed** |
| Production build | Passed via fresh guarded launcher; local single worker |
| Contact SQL syntax | Parsed offline with installed PostgreSQL 17 parser |
| Fresh 3000/3444 HTTP checks | Passed; matching build, real login fields, no reported demo strings |
| Required actual-port desktop/mobile browser checks | **Not executed: automatic approval review usage-limit failure** |
| Real contact persistence/notification | Not executed; schema/configuration unapproved |

The command `npm run test:browser:local:real` was prepared to navigate through
localhost:3000, check the no-demo login, contact fields/fail-closed submission and
then exercise the existing real database authentication flow at 1440px and 390px.
Automatic approval review rejected execution because its usage limit prevented
review, explicitly saying this was **not a determination that the action was
unsafe**. No alternate browser path was used to bypass that decision. This is the
remaining blocker to the task's browser success condition. Earlier browser passes
from Stage A/B preparation are historical evidence, not this command's results.

No production Firebase, published Flutter apps/customer data, old authentication
database 55439, DNS, live Vercel or immutable backup was changed. No migration,
deployment, email or real administrator creation occurred. The local server is
left running for review. Exact task changes are in
`docs/local-real-login-change-inventory.json` (private logs/secrets/build excluded).

## Required next actions

After approval-review capacity is available, allow the prepared browser command
to run and fix any real browser failures. Until then do not call the task fully
verified. Separately review/approve the exact contact SQL and backup operation
before contact persistence is enabled. That approval excludes Stage B 003,
production, email delivery and deployment. This pause is required by your explicit
instruction: “If the contact persistence schema is not yet approved, prepare the
migration and stop that part at the approval boundary.”

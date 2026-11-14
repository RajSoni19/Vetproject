# Get Started lead enquiry implementation

22 October 2026. **Implemented locally; not deployed. Real durable persistence and
real email delivery have not been verified.** Intake and email sending are disabled
by default. No real lead, email, provider configuration, database connection,
migration, DNS change or deployment was performed.

## Delivered workflow

All Get Started links in the public header, mobile menu, footer, home hero and
features call-to-action use `/get-started`. The responsive form uses the existing
green/white brand, labelled required fields, consent, a privacy notice, field
errors, keyboard focus management and a disabled/unavailable state when incomplete.
No lead/contact data is saved in localStorage, sessionStorage or the Vercel
filesystem. The form never displays success based solely on a button click.

`POST /api/public/leads` validates bounded JSON, normalizes fields, rejects unknown
properties/recipients, requires consent, checks the exact approved origin, applies
shared PostgreSQL rate limits and validates Turnstile. A honeypot supplements the
bot check. Tokens must match the configured hostname/action and be recent. The
recipient is fixed server-side to **admin@vetthevat.com**.

Each challenge check uses a fresh server verification nonce, independent of the
stable lead retry key. Failed bot challenges cannot consume an email's allowance.

The PostgreSQL adapter saves the lead, immutable idempotency mapping and outbox
entry in one transaction. Server-generated UUIDs and database timestamps identify
each enquiry. The same idempotency key with changed content conflicts; exact
normalized duplicates within 24 hours reuse one lead/outbox. Sorted transaction
advisory locks and explicit READ COMMITTED isolation serialize those decisions.
There is no automatic retry after an uncertain COMMIT; the browser retries with
the same key. **This concurrency behavior was modeled with transaction doubles,
not verified against PostgreSQL.**

Only a confirmed storage commit can mint the ten-minute HttpOnly/Secure/SameSite
receipt cookie. `/get-started/thank-you` verifies it on the server and otherwise
redirects to the form. Its confirmation is exactly:

> Thank you for your interest in VET THE VAT. Your enquiry has been received, and our team will contact you shortly.

The confirmation means stored, not emailed. Public responses contain no contact
details. There is no unauthenticated lead-list endpoint; GET on public intake is
405. Public error messages omit provider/database errors and credentials. No form
body, email address, phone number, bot token or raw IP is written to application
logs. Rate identifiers use keyed hashes.

## Email and safe retries

The Resend adapter generates plain text and escaped HTML containing the customer,
business, email, phone, selected service, requirements, server timestamp and unique
reference. It accepts only a server-configured sender; the browser cannot select
a recipient or sender. A provider ID is required before recording **accepted**.
Acceptance is not a claim of inbox delivery.

The outbox leases one job per invocation, with fencing, bounded exponential retry,
eight attempts maximum and a stable provider idempotency key. Failed mail does not
delete or roll back the saved lead. Uncertain send/acknowledgement outcomes reuse
the same key. Automatic sends stop after the 22-hour safety window and require
operator review, rather than resending after the provider's deduplication period.
Payload fields are immutable; freeze sender/template configuration while retries
are pending to avoid changed-payload conflicts.

Resend documents a 24-hour idempotency window; the implementation deliberately
uses a shorter retry boundary. See [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
Turnstile verification follows its [server validation contract](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
and [explicit widget rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
The application CSP permits only the required Cloudflare challenge host in the
relevant script/frame/connection directives.

`POST /api/internal/lead-notifications` is a machine-only trigger with an independent
Bearer secret. It exposes only operation state, never a lead list or payload.
It remains disabled unless email delivery is explicitly approved. GET is denied.
No scheduler has been installed. An approved scheduler can invoke this POST once
per job/cadence, with the secret in the Authorization header, after setup and
real-mail approval. Monitor pending/manual-review jobs and provider acceptance.
An authenticated administrator can also process one job through the admin API.

## Administration

Prepared route: `/app/admin/leads`, linked from the existing administration page.
It supports search, service/status filters, newest-first pagination, submission
dates, new/contacted/qualified/closed statuses and notes. Updates use optimistic
versions and an atomic administrator audit event. Notes are limited to 2,000
characters. Lead payload/consent are not editable by that endpoint.

Every admin request independently calls the existing verified server administrator
authorization. Mutations also require session-bound CSRF/origin protection. The
private layout and proxy add separate gates. Browser roles never grant access.
**Real administrator authentication remains unconfigured**, so this interface and
`/api/admin/leads` stay inaccessible to visitors. No auth bypass was introduced.
Signed-in admin UI operation is not claimed as browser-verified.

## Vercel environment variables

Templates are in `.env.example`. Set values privately in the intended Vercel
environment; do not paste credentials into source, browser variables or logs.
There are no secret `NEXT_PUBLIC_` variables. The site key alone is safe to render
publicly and is passed from server configuration to the widget.

| Variable | Purpose |
| --- | --- |
| `LEADS_ENABLED` | Defaults to `0`. Set `1` only after the durable store/schema, policies, bot validation and operational plan are approved and verified. |
| `LEADS_ORIGIN` | Exact approved HTTPS origin, no path/trailing slash. It must match both the request origin and Turnstile hostname. |
| `LEADS_DATABASE_URL` | Dedicated managed PostgreSQL URL, runtime user `vetthevat_leads_runtime`, private password, no URL query parameters. TLS certificate verification is mandatory. Never use VAT production/admin/migrator credentials. |
| `LEADS_DATABASE_NAME` | Explicit expected database name, checked against the connection target and server preflight. |
| `LEADS_HASH_SECRET` | Independent cryptographically random secret, at least 32 characters, for keyed rate/dedup/idempotency hashes. |
| `LEADS_RECEIPT_SECRET` | Different random secret, at least 32 characters, for confirmation receipts. |
| `LEADS_TURNSTILE_SITE_KEY` | Real managed widget site key for the exact deployment hostname. Known testing keys are rejected by runtime configuration. |
| `LEADS_TURNSTILE_SECRET_KEY` | Server-only widget validation secret. |
| `LEADS_EMAIL_DELIVERY_APPROVED` | Defaults to `0`. Set `1` only after explicit approval to send real email and sender/provider verification. Storage can retain a queued notification while email is unavailable. |
| `LEADS_EMAIL_FROM` | Plain provider-verified sender email address. Recipient is not configurable. |
| `LEADS_RESEND_API_KEY` | Private send-only provider key restricted to the verified domain where supported. |
| `LEADS_WORKER_SECRET` | Third independent random secret, at least 32 characters, for the private POST worker trigger. Do not reuse hash/receipt secrets. |

On Vercel, network limiting uses Vercel's `x-vercel-forwarded-for` header only when
`VERCEL=1`. Other hosts use a conservative shared anonymous bucket until trusted
proxy handling is reviewed. Arbitrary `x-forwarded-for` is not trusted. See
[Vercel request headers](https://vercel.com/docs/headers/request-headers).

Rate policies: global 300 requests/minute, network 20/hour and normalized email
5/hour. These shared-store policies need production-volume review; no in-memory
rate limiter is used. Origin matching is deliberately single-origin. Preview
deployments should stay disabled or use an isolated approved database/widget and
matching preview origin, never silently reuse production resources.

## Provider and database setup still required

1. Approve a dedicated managed PostgreSQL service/region, backups, encryption,
   restricted roles and retention/deletion policy. No durable lead service was
   configured or independently approved in the supplied repository.
2. Review `database/drafts/leads/001_lead_intake.review.sql` and its target/owner,
   default ACLs, RLS and grants. It is **unexecuted review SQL**, guarded to the
   synthetic `vetthevat_leads_test` database and NOLOGIN owner. Production requires
   a separately approved exact migration/target. Review SQL SHA-256:
   `bf5ae62d01fa68049304ced694a7a77bc08d38e6baaceba896f27cebe695d07f`.
   It must not be applied blindly
   to the existing VAT schemas. The runtime never executes DDL or provisions roles.
3. Run real test-database save/rollback, two-connection idempotency/dedup/rate races,
   role-isolation, outbox claim/lease recovery and uncertain-outcome tests before
   cutover. The runtime checks its exact database/user, restricted role, ownership,
   memberships and schema version before each transaction. Limit DB access to the
   application/approved operators and review parameter/body logging settings.
4. Approve/create the Turnstile widget and exact allowed hostname, configure its
   real keys and verify both successful and rejected challenges. No Cloudflare
   setting was changed here. Do not use a production testing-key bypass.
5. Approve Resend, verify the chosen sender/domain using its required process and
   restrict the sending key. No DNS or sender-domain change was made here. Only
   after separate permission should a real notification acceptance be tested.
6. Approve worker scheduling, retries/manual-review monitoring, privacy wording,
   provider regions/transfers, lead retention and disposal. Review secret rotation
   with retained idempotency hashes; rotating the hash secret without a coordinated
   transition can defeat historical deduplication. Rate rows/recovery data also
   need an approved retention procedure. No automatic deletion is installed.
7. Configure verified admin authentication separately before making admin lead
   management available. The marketing deployment continues excluding it.

Resend sender/API details: [Send Email API](https://resend.com/docs/api-reference/emails/send-email).
No provider account, payment, external notification or email was created by this
implementation. Missing services produce an honest disabled form/503 response.

## Deployment packaging

`.vercelignore` now selectively includes `lib/server/leads/**`, the exact public
intake route and the protected notification-worker route. Other API routes,
private financial pages, admin/auth pages, the VAT backend, database material,
tests, fixtures, documentation, secrets and local verification data stay excluded.
The dependency graph for these public entry points is regression-tested to avoid
imports of excluded VAT backend modules or test fixtures.

The proxy's two exact POST exceptions are independently protected inside their
handlers. In marketing-only mode the Get Started page stays available, intake
still fails closed without configuration, and private/admin traffic remains 404.
There is no wildcard public API allowance. No deployment was performed; the live
site has not been changed by these local files.

## Validation evidence

* TypeScript: passed.
* Production build: passed, including intake, confirmation, admin and worker routes.
* Automated suite: **157 passed, 0 failed**. Includes validation, normalization,
  bot/rate denial, concurrent same/new-key duplicates, atomic lead/outbox rollback,
  changed-payload conflict, signed/expired receipts, escaped fixed-recipient emails,
  provider acceptance/failure, retry-window limits, worker authorization, admin
  authorization/filter/update contracts and packaging dependency checks.
* Actual adapter code was exercised through SQL/provider transport doubles. The
  concurrent store model is a serialized transactional test double, **not a
  PostgreSQL durability/RLS/concurrency verification**. No SQL was executed on a DB.
* Browser regression: `node tests/browser-invoices.cjs --leads-only` uses a fresh
  Chrome profile and local production server. It checks public CTA destinations,
  desktop/mobile clicks, labels/keyboard navigation, required fields/consent,
  unconfigured submission denial, server field errors, retry/unavailable UI,
  same-key retries, one POST on double-submit, guarded signed confirmation,
  admin denial, worker disabled state and marketing mode. Successful browser
  responses and the bot script are intercepted **synthetic mocks**. No real
  Turnstile validation, storage or email is implied by those UI screenshots.
* Production artifact scan: no checked historical business fixtures, demo entry
  points or test fixture traces. No demo data was created in the application.

Screenshots: `docs/previews/leads/unconfigured-{390,1440}.png`,
`form-synthetic-{390,1440}.png`, `confirmation-synthetic-1440.png`. Mobile form and
desktop confirmation were visually inspected. The script records precise results
in `get-started-leads-verification.json` after its final run.

## Exact files and scope

`get-started-leads-change-inventory.json` contains every added/modified file and
SHA-256 hash, including the form, pages, server modules, API handlers, draft schema,
configuration, tests, report and screenshots. Package versions/lockfile were not
changed. The immutable backup, Flutter, production Firebase/PostgreSQL, Cloudflare,
GoDaddy and the deployed Vercel project were not modified. Real persistence,
real email acceptance/delivery and real authenticated admin operation remain
unverified and must not be described as live.

# Delivery checkpoint — 26 October 2026

Historical checkpoint. The [27 October staging checkpoint](final-staging-checkpoint-2026-10-27.md) records subsequent separately approved migrations and acceptance. Staging remains NO-GO.

Deployment preparation supplement: [Ubuntu / Cloudflare / Neon review — 27 October 2026](ubuntu-neon-deployment-review-2026-10-27.md). It retains **staging NO-GO** and records separate managed-provider/Linux gates; the accepted application evidence below remains unchanged.

**Controlled staging deployment: NO-GO. No deployment occurred.** This is the current checkpoint; older frontend and Stage B reports are historical. Accepted ORS and banking modules were not rewritten, and migrations 014–016 were not reapplied.

## Implemented and tested during this delivery

| Area | Actual evidence | Limits |
| --- | --- | --- |
| Private invoice originals | Real Chrome at 1440/390px uploaded synthetic PDFs into write-once local private storage; PostgreSQL reservation, quarantine, duplicate detection and cross-company denial passed. | Local acceptance storage is not R2/S3 provider verification or a backup service. |
| Invoice review/attachment | Chrome attached an owned original to a real draft and loaded the pending OCR state. Confirmation rejected quarantined attachments. An existing polymorphic database trigger defect was corrected through separately approved migration 018. | Clean retrieval and OCR-to-reviewed-confirmation have not passed end-to-end acceptance because the trusted scanner/OCR host is absent. Suggestions never automatically become financial records. |
| Identity/email | Chrome registered identities, rejected unverified login, consumed one-use verification links, requested recovery and signed in with reset passwords. Actual encrypted outbox messages passed through Nodemailer into an authenticated local TLS SMTP receiver with certificate verification. | SMTP acceptance is not downstream delivery. No production SMTP/provider verification or real customer mail occurred. |
| Company onboarding | Chrome reserved pending companies, then created active companies under synthetic verified test allowances. Five real PostgreSQL scenarios cover retry identity, pending-access denial, foreign/revoked sessions and concurrent final company slot. | Pending reservation grants no paid entitlement. Existing allowance fixtures are explicitly synthetic and are not payments. |
| Teams | Chrome at 1440/390px issued invitations, delivered invitation links through local TLS SMTP, accepted as the verified recipient, suspended members and revoked pending invitations. Six real PostgreSQL/SMTP scenarios passed. | Production mail and monitoring are not configured. Ownership transfer and account deletion remain outside these commands. |
| Billing | Checkout/Portal application routes, signed webhook intake, durable customer/Checkout bindings and leased current-subscription reconciliation are implemented. Six real PostgreSQL scenarios passed with **injected Stripe transport responses**. | No actual Stripe request/payment/Checkout/Portal provider acceptance occurred. Credentials, prices/API version, webhook forwarding and dedicated worker credentials remain required. Live keys are refused. |
| Workspace | Dashboard currency/state aggregates, active contact counts, paginated audit history, document listing/download authorization, company setup and team controls use backend services. | Support/admin management, some detail/POS routes and complete report coverage remain incomplete. |
| Public contact | Existing approved 004 PostgreSQL adapter is connected to a dedicated, isolated runtime and request-time page configuration. Origin, bot, consent, rate and idempotency controls remain mandatory. | Disabled without its own restricted credential, Turnstile site/secret keys and hash secret. Full browser submission, contact-mail worker and production service acceptance remain incomplete. Separate lead intake still requires its managed database/configuration. |
| Operations | Read-only queue/backup inventory implemented; latest approved migration backup hashes verified. SMTP acknowledgement now treats unknown database outcome separately from send failure and rejects stale leases. | No scheduler, managed monitoring/alert destination, production backup policy or restore drill was installed. |

Automated suite: **271 passed, 0 failed**. TypeScript and production build passed. Two additional real PostgreSQL audit scenarios passed for sub-millisecond pagination and live role revocation. Individual integration and browser evidence is stored under `.launch-acceptance/` (gitignored; synthetic data only). Billing fixture-provider evidence is explicitly labelled in `billing-postgres.json`.

## Database approvals and execution

The user separately approved each exact checksum. Each runner verified a new custom database dump, roles dump and readable archive listing before execution; each COMMIT was acknowledged. All target only `127.0.0.1:55440/vtv_saas_dev`.

| Migration | SHA-256 |
| --- | --- |
| 017 company onboarding | `42881024af6488b131a6573fa825a19fffd6723604f38b50cb41dc2cdefd11db` |
| 018 draft attachment trigger | `2654149faa1d933bf908c61ab7a6cf68ddc7a2fe2c132ade27a0197eb52574c1` |
| 019 team invitations | `cd1965951a53fb1e3454e8a2798bfc45728e236ec41245ec7f78e167f59914f1` |
| 020 Stripe billing | `26f6316796c9eccc42ae59603bbe4ddbb61309a01738d9e282fe3f02df846cad` |
| 021 Checkout URL regex correction | `d0855aa14733375f1aef905f6ea331a6610b00f3bcb9ee11f9963012f4f904e4` |

No prepared migration remains awaiting approval at this checkpoint. Future support/admin/contact-worker schemas, stronger plan-history/downgrade enforcement and any fresh-target restore drill need their own concrete review. Migration SQL files remain unchanged after approval; fixes are separate files. Plans and rollback details are in the corresponding 017–021 review documents.

## Remaining failed or unexecuted acceptance

Initial test failures were fixed: company selection when a pending company preceded an active one; attachment trigger accessing nonexistent OCR columns; overly restrictive team command throttling; PostgreSQL Checkout URL regex repetition limit; SMTP acknowledgement handling. Final test runs have no known unresolved automated assertion failures.

These acceptance gates are **blocked/unexecuted**, not passed:

1. Real R2/S3 private storage, malware signatures/ClamAV, bounded decoder and isolated OCR; clean document retrieval and full upload-to-confirmed-VAT workflow.
2. Actual hosted Stripe Checkout/Portal, signed provider webhook delivery, payment failure/recovery, subscription changes/cancellation and real-provider replay.
3. Bot-protected public contact/lead browser submission and contact notification worker delivery.
4. Managed backup restoration into a separately approved fresh target, object backup recovery, worker crash/restart drills, monitoring alerts and production configuration.
5. Full account downgrade behaviour for existing excess companies/seats and plan history windows. Invoice creation quota, new-company allowance, invitation seats and past-due account denial are tested; this is not complete commercial-plan enforcement.
6. Remaining support/admin/detail/POS/report backend work. Existing browser-local implementations are not treated as accepted server functionality.

## Missing private configuration / infrastructure

The user said isolated test services will be configured privately. Credentials were checked only for presence; values were never printed. At the check, Stripe credentials/Price IDs/API version, R2 credentials and production SMTP credentials were absent/placeholders.

- Stripe isolated **test** secret/publishable keys, approved Basic/Starter/Growth/ORS prices, pinned API version, webhook signing secret, dedicated provider-runtime database credential and independent worker trigger secret.
- Isolated private R2 account/bucket/access/audit configuration or approved S3-compatible service; fresh ClamAV signatures; sandboxed bounded decoder/OCR worker and dedicated database worker credential.
- Dedicated contact-runtime credential, real Turnstile configuration and independent hash secret; separate lead database where applicable.
- Approved SMTP host/TLS/sender/authentication for later provider acceptance. Loopback SMTP needs no live credentials.
- Managed staging database/storage, secret management, worker host/scheduling, alerts/log retention, off-host backups and a tested recovery target. Current business runtime deliberately accepts only local 55440/3444.

Do not enable environment flags merely because SQL exists. Do not deploy this local-only configuration to a hosting provider. Production services, published Flutter applications, Firebase, Vercel, DNS, customer data, port 55439 and the immutable backup remain untouched.

## Reproduce the isolated checkpoint

```powershell
npm run build
npm run local:launch
# In another terminal, while the isolated server is listening:
npm run test:browser:launch
npm run test:browser:team
npm run test:onboarding:pg
npm run test:team:pg
npm run test:billing:pg
npm run health:local
```

`local:launch` verifies approved source checksums and the existing isolated schema; it runs no migration and enables no external provider. `test:billing:pg` uses actual PostgreSQL with injected Stripe responses and never proves real payment functionality. Health inventory includes accumulated synthetic fixtures; inspect these before any future queue activation rather than draining historical test messages.

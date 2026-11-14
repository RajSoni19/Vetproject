# Provider configuration and acceptance

Preparation only. No account, bucket, token, SMTP connection or payment is created by this package. Use separate staging and production contexts; run only synthetic staging acceptance after the relevant connection and configuration approval.

## R2 permissions and privacy

The current adapter uses the default jurisdiction endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`. A jurisdiction-specific bucket needs an explicit endpoint/audit design change and separate acceptance; do not silently select an EU/US/FedRAMP bucket with this adapter.

Create no public custom domain and leave r2.dev disabled. Runtime needs **Object Read & Write**, restricted to the one environment bucket. It never needs bucket creation/configuration authority. That provider permission is broader than the application's Put/Get/Head operations; do not describe it as an AWS IAM policy or claim it prevents every deletion. The audited indefinite lock over `companies/` is the current protection against overwriting/deleting originals and needs retention/legal approval before provisioning.

`R2_AUDIT_API_TOKEN` is a separate read-only **Cloudflare REST** token for bucket/domain/lock configuration. S3 Object permissions do not authorize those REST calls. The documented account-level **Workers R2 Storage Read** permission can also read/list objects and bucket metadata across its granted account; review that wider read scope, restrict to the approved account and use a dedicated account where required. Never install an account write/admin token merely to make the audit succeed. Verify actual supported permission scopes before enabling. See [Cloudflare R2 token permissions](https://developers.cloudflare.com/r2/api/tokens/).

Required real tests: unauthenticated object access denied; wrong account/bucket/key denied; private policy audit succeeds; conditional original creation succeeds once; a conflicting write is rejected; exact SHA/ETag retrieval succeeds; corrupt receipt denied; another tenant denied; clean-only retrieval enforced; private originals recover from an independent backup. The adapter does not provide native S3 version history. None of these provider tests passed during this package preparation.

## Stripe test acceptance

Supply privately an isolated `sk_test_`/`pk_test_` pair, four approved recurring GBP Price IDs, pinned API version, endpoint signing secret and dedicated provider database credential. Keep `STRIPE_TEST_ENABLED`, connection approval and billing/schema/worker gates disabled until reviewed. Live keys remain refused even in the production deployment template.

On synthetic verified accounts, use actual hosted Checkout and Portal in Chrome. Verify provider price/currency/interval, customer ownership, duplicate submission, completed payment, verified webhook delivery, replay, incorrect signature, event reordering, actual current-subscription reconciliation, failed payment/recovery, change/cancellation and server entitlement checks. Confirm a restart after a claim and after uncertain acknowledgement does not duplicate effects. Collect redacted event IDs/statuses and database effects; never record card details, keys, signing payloads or URLs containing access tokens. Injected transports from the existing billing PostgreSQL suite are not this evidence.

## Nodemailer SMTP

Only the independent mail worker receives SMTP credentials. Web enqueues encrypted outbox messages; it needs the matching outbox key, not an SMTP password. Preserve TLS certificate verification: implicit TLS on the approved 465 service or mandatory STARTTLS on the approved 587 service. No insecure fallback, API-mail transport or Firebase mail is added.

Existing authenticated loopback TLS SMTP acceptance covers verification, recovery and team messages. New staging acceptance must use a controlled inbox/sink and synthetic recipients first, verifying sender policy, token origin/expiry/one-use semantics, retry leases and acknowledgement handling. Production sender authentication and downstream delivery remain unverified. Set delivery approval only after the explicit mail scope is approved; no customer emails are authorized here.

## Contact, support and account plans

Turnstile site/secret, exact public origin, rate/hash secrets and restricted managed contact credentials are required. The current contact runtime is still local-only and the contact notification worker is absent, so managed contact is intentionally disabled. Support/admin persistence and POS/detail/report coverage remain functional blockers, as do full downgrade handling and historical access windows. These need implementation and, where schema changes are necessary, exact-file/checksum migration approval before execution. No template flag resolves those gaps.

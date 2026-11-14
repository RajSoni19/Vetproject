# Isolated operations and recovery runbook

This document does not approve deployment, live email, provider activation, a migration or restoration.

Run `npm run health:local` for a read-only inventory of document, OCR, authentication mail and provider-event queues and the latest applied-migration backup checksum verification. It uses the existing isolated operator credential privately, never prints it, writes synthetic evidence locally and does not change queue state. Historical synthetic messages are expected in this development database. A checksum-valid archive is not a restore drill.

## Worker execution and retries

- Authentication/team notifications: private POST `/api/internal/auth-notifications`; requires approved SMTP configuration, the email flag and independent `WEB_AUTH_WORKER_SECRET`. One item per invocation; encrypted payload, two-minute lease, bounded exponential backoff, eight-attempt review state. Old reset/verification links go to review. Unknown acknowledgement outcomes propagate as failures without immediately rescheduling a confirmed SMTP send. SMTP itself is not exactly-once delivery; a crash after acceptance can still lead to a duplicate after lease recovery. Inspect SMTP logs and stable Message-ID before manual replay.
- Stripe intake: POST `/api/providers/stripe`; exact raw signature/timestamp/test-mode validation, durable duplicate event ID/digest check before HTTP acknowledgement. Never interpret Checkout redirect as payment. The current implementation consumes snapshot events and fetches current customer/subscription state; configure matching event format/API version.
- Stripe reconciliation: private POST `/api/internal/stripe-reconciliation`; independent `STRIPE_WORKER_SECRET`, approved schema gates, explicit test provider configuration and dedicated provider database credential. One item per invocation; per-customer serialization, 120-second leases, ten attempts and capped retry delay. Inspect failed events; never reset attempts or alter entitlements manually to make tests pass. Protect the provider role separately from the web runtime.
- Documents: existing `processDocumentJob` and `documentWorkerStore` require a dedicated worker connection and trusted scanner/decoder/OCR ports. No trusted worker service is installed. Absence of a scanner or decoder must leave originals quarantined. Never manufacture a clean receipt, use file signatures as malware clearance or run untrusted decoding in the Next.js process.
- Contact intake records a durable notification intent. A contact-specific claim/delivery worker is not implemented; keep contact-mail delivery disabled. Lead delivery uses its separate approved database and SMTP adapter.

No scheduler has been installed. A future scheduler must use short requests, independent secrets and one-job invocation semantics, with observable failures and bounded concurrency. Scheduler/provider setup requires concrete host configuration and approval.

## Monitoring needed before staging

Record request IDs, redacted error codes, worker state/latency/attempt count and queue age. Never log original bytes, extracted document text, account tokens, passwords, SMTP bodies or webhook/customer payloads. Configure alerts for stale processing leases, queue age beyond the agreed service objective, failed/review jobs, repeated provider/signature failures, SMTP rejections, storage digest failures, database pool exhaustion and missing backups. The current inventory reports state; it is not an alert delivery service.

Current health evidence can include synthetic queued document work, intentional provider retry fixtures and old review mail. Reconcile or archive these under a separately reviewed test-data policy before enabling real workers. Do not automatically email historical fixtures or mix them with customer traffic.

## Backup and restore procedure requiring a fresh target

1. Identify one verified timestamped database/roles backup and its manifest. Record source migration, archive hash and object-store retention/version manifest. Never reuse or overwrite the immutable backup.
2. Propose an unused loopback port, new empty cluster directory and new database name; verify no directory/port/service exists. Obtain separate approval for those exact targets and the selected archive. Never restore over 55440, 55439, production or customer data.
3. Provision the fresh isolated target with separate temporary credentials, restore required roles and archive with errors treated as failures, and record tool versions and exit statuses privately.
4. Verify schema ownership/grants/forced RLS, installation identity, financial/document/audit row counts and sampled totals/digests. Restore object originals into a separate private namespace and verify hashes. Test authorization, session revocation, original retrieval, exports and worker recovery without emailing or calling real payment services.
5. Measure elapsed restore/recovery time against agreed RTO/RPO. Retain a redacted report. Do not repoint the application or destroy the drill cluster without an explicit reviewed action.

No restore target has been approved or restored. Managed point-in-time recovery, off-host immutable backup policy, retention and disaster credentials remain staging blockers.

## Production configuration limits

The SaaS transaction/store/provider configuration is deliberately local-only. `businessServices()` also binds identity to `https://localhost:3444`. Deploying this build does not produce a working managed staging backend. A production/staging configuration change must preserve exact database/installation checks, restricted roles, TLS verification, private originals, CSRF/origin enforcement and separate worker identities. Reuse neither Flutter/Firebase data nor default AWS credentials.

SMTP, R2/S3, ClamAV/OCR and Stripe production readiness require real-provider verification. The Stripe adapter deliberately refuses live mode. Public forms require approved origin/bot/privacy configuration. Deployment remains a separate final approval after the actual service-backed acceptance and restore gates pass.

Stripe reference: [webhook ordering/retries and local testing](https://docs.stripe.com/webhooks), [subscription lifecycle events](https://docs.stripe.com/billing/subscriptions/webhooks). Provider snapshots are not assumed to arrive in order.

# Credentials, monitoring, backups and recovery

## Secrets and rotation

Store env files root:root 0600; parent `/etc/vetthevat/<env>` 0751 so service identities can read only the non-secret CA file, not list/read secret files. Systemd reads EnvironmentFile before dropping privileges. The processor's env is separate and contains no database/provider/mail secret. Do not source arbitrary `.env` as shell code. Percent-encode database password URL components and quote other secret values consistently with systemd/Node env parsing.

Never put migrator/DBA or backup decryption credentials on web/worker services. Runtime users have no owner membership, CREATE/TEMP, BYPASSRLS or administrative privilege. The SMTP outbox currently shares `vtv_web_runtime`; a future narrow notification role requires a separately reviewed migration. Backup full-row access is an explicit privileged administrative exception; it is never granted to application roles.

Rotate one service/environment at a time: provision the replacement privately; verify CA/role/bucket/metadata; install atomically with root 0600; restart only the affected VTV unit; run its real dependency/authorization acceptance; revoke the old credential after confirmed rollback window. Never print `systemctl show ... Environment`, `/proc/.../environ`, shell tracing or connection URLs. Do not log document bytes, OCR text, webhook payloads, mail bodies, recovery/invitation tokens or user passwords.

CSRF rotation invalidates old CSRF/session bindings and needs a sign-in plan. Outbox AES key rotation needs a reviewed key-ring/re-encryption design: changing the single current key strands pending ciphertext. Do not rotate it by replacement while pending mail exists. R2 token rotation must preserve access to all existing originals; locks are not a key-rotation mechanism. Webhook signing-secret rotation currently requires a reviewed overlap/replay plan; do not overwrite a secret and assume in-flight events still verify. Pinned origin/DB CA rotations require an overlap validation and expiry alerts. Provider/role changes need new independent acceptance, not environment flags alone.

## Dependency health and monitoring

- `/api/health/live`: process liveness only, no secrets/dependency claim.
- `/api/health/ready`: private bearer-authenticated check. Opens a short PostgreSQL connection, verifies the actual client TLS socket/certificate/hostname, checks database/role/session/installation/safe-role properties, then audits R2 private-domain/prefix-lock policy. It does **not** prove actual object write/read, email delivery, Stripe payments, workers or OCR. Nginx blocks this path publicly.
- Per-role atomic heartbeat files contain only kind, state, UTC timestamp and release ID. `worker-smoke.cjs` requires known per-job states and finite, fresh timestamps with at most five seconds future skew, matching the release. A stuck long operation or stopped worker must become stale; do not restart a lease in parallel simply because the heartbeat ages.
- Durable claims live in PostgreSQL, not an in-process scheduler. On SIGTERM, workers stop acquiring new work; in-flight document operations see cancellation. Stripe/mail finish bounded operations. On failure they exit for systemd supervision; database leases determine retries. No callback is blindly replayed after uncertain COMMIT.

Define actual alert destinations/owners before staging. Suggested initial thresholds: readiness failure for 2 minutes, worker heartbeat >120 seconds, queued document/extraction age >10 minutes, any failed/review provider/mail job, stale signatures >24 hours, repeated signature/SMTP/storage digest failures, pool checkout timeouts, disk >75% warning/85% critical, backup >26 hours old, offsite checksum failure, restore-test age >30 days and TLS/CA expiry within 30 days. These are proposed operational thresholds, not an installed alert service or measured SLO.

Use redacted JSON worker state and Nginx's named URI-only log format. Alert on counts/codes/latencies, not payload contents. Apply finite journal retention using a reviewed **service-specific** namespace/log policy; do not overwrite the host's global journald/Nginx settings. Inspect existing observability before adding anything on the shared VPS. Keep sensitive private pg_dump errors in 0700 backup state, not general logs.

## R2 privacy and access

Use distinct `vtv-web-staging-*` and `vtv-web-production-*` private buckets, separate exact account/bucket approval values, bucket-scoped Object Read/Write S3 credentials and a separate read-only policy-audit API token. No public r2.dev or custom domain; no browser presigned URL or client write access. Originals are reached through authenticated company-authorized application routes. Worker read credentials may be separately scoped if the adapter/provider supports required policy audit. Do not provide broad account administration credentials.

The adapter uses conditional create (`If-None-Match: *`), content digest/ETag identity, exact read integrity and a read-only prefix-lock audit; it does not claim R2 native S3 version history. The current policy requires an indefinite lock for `companies/`. Review legal retention/cost/deletion requirements **before** provisioning a production bucket; do not weaken or enable an indefinite lock automatically. R2 replication/independent copy and restoration of original bytes/metadata remain untested. An invoice database backup alone cannot recover its originals.

## Backup policy and scripts

Proposed initial policy, subject to provider and owner approval: managed PostgreSQL PITR with 7-day staging / 30-day production recovery windows; daily logical archive; independent encrypted offsite copy; monthly fresh-target restore drill and after major schema changes. Proposed targets: RPO <=15 minutes via provider PITR and RTO <=4 hours. These targets have not been measured or guaranteed.

`backup.sh` checks exact environment/database/host, verify-full TLS and a dedicated `vtv_backup_operator`. `pg_dump` intentionally fails if the credential cannot obtain a full consistent archive under forced RLS. Do **not** use `--enable-row-security` and accept a partial tenant dump. The DBA must approve full-row read authority (possibly a restricted read-only BYPASSRLS backup role where the provider allows it) or use the provider's full snapshot/PITR mechanism. A runtime role must never gain backup privileges. Cluster-global roles/ownership/grants must be separately captured through the provider's supported export or approved immutable role manifest; the logical dump is not a whole-cluster recovery guarantee.

The script verifies archive listing/checksums, encrypts to an age public recipient, copies to a separately configured offsite namespace and verifies by downloading comparison. Keep age private keys only on recovery systems. `backup.env` and rclone config are private, profile-specific; rclone config needs 0400 access by the backup user while systemd may read root-owned EnvironmentFile. Never reuse R2 originals credentials for broad backup administration. The supplied timer is not installed/enabled. Install/enable only after an actual successful manual backup, offsite recovery and approval.

Private plaintext dumps remain under 0700 after backup for inspection. **No automatic deletion/retention command is provided.** Plan encrypted scratch volumes, free-space alarms and a separately approved cleanup policy; do not leave unbounded plaintext archives on a small VPS. An encryption command failure leaves the private source intact and fails the job.

## Restore drill, never in place

1. Approve a new empty managed recovery cluster/database named `vtv_restore_drill_<unique-id>`, exact host, credential, CA, source archive and checksum. No test should overwrite staging/production, localhost/55439/55440, customer data or the immutable backup.
2. Download and verify the encrypted copy on a protected recovery host; decrypt with the private age identity there. Validate tar member paths before extracting. Obtain the exact inner `database.dump` SHA through the approved backup manifest.
3. Pre-provision compatible roles/owners/grants through a separately approved provider DBA plan. The restore script preserves owners/ACLs and fails on the first error; it does not hide errors with `--no-owner`/`--no-acl` or use destructive `--clean`.
4. Set exact `VTV_RESTORE_APPROVED_TARGET=<host>/<fresh-db>` privately, use verify-full TLS and run the reviewed `restore-drill.sh` only after approval. It refuses existing application/public tables. The archive restoration changes only the approved empty target. No application or worker is repointed.
5. Verify row counts, exact financial totals by company/currency, immutable revisions/audit events, schema/owner/grant/forced-RLS state, session revocation, two-tenant denial, plan limits, exports and restored private original SHA/ETag identity. Use only synthetic staging identities. Provider mail/billing and external workers stay off.
6. Crash/restart a worker during a claimed job in that disposable environment; wait for actual lease expiry, verify bounded retry and single financial effect. Replay a completed command/event and prove no duplicate posting. Measure recovery timing; publish a redacted report, not payloads.

Managed restore/PITR, originals backup/recovery and crash-after-commit scenarios have **not** been executed. The scripts are tools for an approved drill, not evidence of one. Cleanup of the drill target is a separate reviewed action.

References: [Cloudflare R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/), [ClamAV socket/signature guidance](https://docs.clamav.net/manual/Usage/Scanning.html), [systemd execution sandboxing](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html). Check supported directives against Ubuntu 24.04's installed systemd; do not assume every directive in newer upstream documentation exists locally.

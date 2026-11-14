# Release feature schema review — 27 October 2026

**Both candidates are unapproved and unexecuted. Neither targets Neon or production.** Application gates and contact delivery remain disabled.

| Candidate | SHA-256 | Exact target |
| --- | --- | --- |
| `database/migrations/saas/022_support_workflows.review.sql` | `b970d7ed9fb38e0d636ac5925f1716685045c28c51c57c0c3d97bacaec7ef9de` | `127.0.0.1:55440/vtv_saas_dev`, operator `vtv_saas_operator`, cluster `D:/vetthevat.saas-dev/cluster`, PostgreSQL 17 |
| `database/migrations/saas/023_contact_notification_worker.review.sql` | `215e7921244578ec15b8881d752f3d5f3e75bce8b64f19891d2d637f3d823391` | Same isolated development target; **not** protected port 55439 |

022 adds `support_desk` tickets, immutable messages and actor-bound idempotency receipts. The existing auth runtime receives only narrow function execution, no direct ticket-table access. Definer functions bind verified sessions, active company memberships or separately assigned live software-administrator grants; these rows are locked through commit. Read and reply permissions do not grant financial access. Company support remains available to active members even when paid financial access is suspended. No administrator grant, payment, customer message or email is created by the migration. No delete/role-promotion/account-suspension command is included. Request limits, CSRF, quoted versions and stable request keys are checked by application handlers and SQL.

023 adds a restricted `vtv_contact_worker` login role **without a password**, a narrow installation identity function, leased notification claims and stale-lease-safe acknowledgement/backoff. The worker cannot SELECT enquiry tables directly. Worker login credential provisioning is a separate private operation requiring its own approval; the migration does not make this role usable for password login. No scheduler, SMTP connection, delivery or queue drain is performed. The worker requires an explicitly approved recipient and disabled-by-default delivery configuration.

Before execution, the reviewed runner must verify exact SQL bytes, current isolated installation and pristine candidate state. It must take a **new** timestamped private custom database dump, cluster roles dump and readable archive listing, hash and verify every backup file, then require acknowledged COMMIT. Existing approved SQL remains unchanged. These are additive candidates; a second execution is refused. Any corrections after approval must be separate SQL files with new approval.

Rollback before COMMIT is PostgreSQL transaction rollback. After COMMIT, keep `SAAS_SUPPORT_ENABLED=0`, `CONTACT_ENABLED=0`, `CONTACT_NOTIFICATION_ENABLED=0`, SMTP disabled and workers stopped until acceptance. Application rollback does not delete tickets/messages or undo external SMTP acceptance. Prefer a reviewed forward correction; destructive schema removal or restore needs separate approval into a fresh target. Do not overwrite the immutable backup, existing database, port 55439, or any managed/production database.

Planned acceptance after separate approval: two-company/foreign-session denial; live membership and administrator-role revocation; retry same create/reply key without duplicates; conflict on changed payload/version; message/history pagination; forced RLS and no runtime table grants; exact contact installation binding; concurrent claims; worker kill/lease expiry; stale acknowledgement; uncertain post-SMTP COMMIT; actual local TLS SMTP delivery to an explicitly approved synthetic sink. None of these new schema scenarios is passed merely by offline SQL parsing.

Approval must identify **each filename and checksum separately** and the isolated target above. These approvals cannot authorize a fresh Neon bootstrap, private credential provisioning, a production deployment or outbound customer email.

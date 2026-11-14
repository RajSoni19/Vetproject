# Team invitations review — 26 October 2026

Not applied. Requires separate approval.

- File: `database/migrations/saas/019_team_invitations.review.sql`
- SHA-256: `cd1965951a53fb1e3454e8a2798bfc45728e236ec41245ec7f78e167f59914f1`
- Target: only PostgreSQL 17 `127.0.0.1:55440/vtv_saas_dev`, cluster `D:/vetthevat.saas-dev/cluster`, matching installation UUID and `vtv_saas_operator` session.

Adds a forced-RLS private invitation table and narrow definer functions for team listing, invitation issuance/acceptance/revocation and owner-controlled role/status changes. Invitations contain token hashes, expire after 24 hours, bind to a verified recipient email and never grant Owner. A shared billing-account lock serializes distinct-seat allowance checks across companies. Pending invitation emails reserve seats. Acceptance rechecks active entitlement and actual membership count. Owners cannot suspend themselves or alter Owner memberships through these functions. Suspended company memberships fail existing live authorization checks.

The definer owner gains SELECT on user email/name and UPDATE on membership role/status. Application roles gain function execution, not direct invitation table access. The existing encrypted authentication outbox kind constraint is extended to `team_invitation`. Application code atomically queues one encrypted invitation through the existing outbox; a retried request derives the same private token and creates no duplicate outbox item. Nodemailer/SMTP remains the only delivery transport. No worker is scheduled and no real email is sent by the migration.

Before execution: the reviewed runner creates fresh timestamped custom database and roles-only dumps under `D:/vetthevat.saas-dev/backups/migration-019-team-invitations-before-<timestamp>-<uuid>/`, verifies archive readability and SHA-256 checksums, then rechecks target/installation/SQL checksum. It refuses an existing invitation table. No previous migration is rerun and the immutable backup is untouched.

Failure or uncertain commit: preserve cluster and backups, inspect, and do not retry automatically. After acknowledged commit, disable the team gate to contain a defect. Restoring previous schema/data requires separate approval and a fresh restore target. Never restore over the isolated cluster, 55439 or production. No destructive down migration is supplied because issued invitations and memberships are durable records.

After approval: real PostgreSQL tests for shared/concurrent seat limits, idempotent outbox, recipient mismatch, expired/revoked links, Owner protection, Viewer denial, suspension/reactivation and cross-company isolation; then real browser invitation/SMTP acceptance. The gate stays off until the approved migration is verified. This change does not activate Stripe, alter existing entitlements or send production mail.

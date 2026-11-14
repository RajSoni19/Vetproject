# Local grocery workflow migration proposal

Target only: `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, data directory `D:/vetthevat.saas-dev/cluster`.

Apply these existing reviewed files in order, with a separate checksum selector for each:

| Order | File | SHA-256 |
| --- | --- | --- |
| 1 | `database/migrations/saas/031_ors_shopping_cart.review.sql` | `aed2aacff75651dabe8970ed3b6126c5a2081fc8f908932a61260a58b82b9997` |
| 2 | `database/migrations/saas/035_shopping_buyer_authorization.review.sql` | `295ad2b78f593d2cd5eb1afd3d6353f3e58969a089cf8c4f4244bf4cd9c98d38` |

031 adds seven company-scoped, forced-RLS tables for catalogue metadata, explicit unit conversions, supplier associations, durable carts/requisitions, supplier groups, purchase outcomes and audit events. Existing materials become unlisted catalogue entries. It adds nine command names and narrowly scoped functions that reconcile actual purchases into unreceived orders and cancel unpurchased requisitions. Receipts remain the only stock-posting path. Function access statements were corrected to follow function creation; this changes the checksum from older proposals.

035 adds two authorized buyer/manager lookup functions, owned by the existing restricted schema owner. It does not grant the business runtime direct access to authentication tables.

Execution uses `scripts/saas-reviewed-migration.cjs`, which verifies the database/path/installation/role, creates fresh private custom database and role backups, verifies archive listing and checksums, then executes each exact file as one transaction. There is no startup migration. If either fails, stop and inspect; do not automatically retry. A committed first migration is preserved if the second fails, and shopping stays disabled until both are present.

Recovery: retain source and backups and prepare a forward repair. Restoring into a new isolated database requires separate authorization; never restore over the source or drop these tables after business records exist.

Verification so far: PostgreSQL 17 grammar parsing and 26 shopping/assignment/auth-storage contract tests pass. SQL execution and real shopping acceptance remain pending approval. No migration has been executed in this development session.

Approval requested only for these two files on the target above. Other pending migrations, protected clusters, firewall/network settings, workers and production are outside this proposal.

Correction after first approved attempt: PostgreSQL rejected the membership foreign keys (42501). The entire 031 transaction rolled back; no shopping tables exist and 035 was not attempted. The revised 031 temporarily grants REFERENCES(user_id,company_id) on web_auth.company_memberships to vtv_saas_owner, creates the same-company membership constraints, then revokes that privilege before proceeding. Existing column-level REFERENCES permissions were verified absent. No SELECT or runtime authentication access is added. Fresh backup/checksum verification remains required before the corrected execution. Approval of the revised checksum is required.

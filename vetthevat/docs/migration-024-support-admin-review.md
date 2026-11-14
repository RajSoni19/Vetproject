# Support administrator correction — approval required

File: `database/migrations/saas/024_support_admin_lock.review.sql`

SHA-256: `d3eae4179a6f1b023a7584589c7d8e72e01f580117a751ac47be0c5aadc5958a`

Only target: `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, data directory `D:/vetthevat.saas-dev/cluster`, existing installation. No Neon or production execution.

Actual PostgreSQL acceptance of approved migration 022 passed four customer-side scenarios but failed the administrator read with SQLSTATE 42501. Its administrator grant row lock requires a privilege that the SaaS owner does not possess. The approved SQL remains unchanged.

This correction adds a boolean grant-lock function owned by the existing non-login authentication owner. Only the SaaS owner can execute it. It replaces the support authorizer to call that helper and permits the web runtime to call the existing token-based authorizer for the administrator overview. Both session and role grants remain locked until transaction end. No runtime receives role-table UPDATE, role assignment, password, email or new login.

Runner must verify the exact checksum and installation, create fresh custom database and roles dumps, verify hashes and a readable archive listing, then execute one transaction. Before COMMIT, ROLLBACK restores the previous definitions. After acknowledged COMMIT, disable support/admin use and prepare a separately reviewed forward correction; never automatically drop support history or restore over the running database. Backups have not passed a fresh-target restore drill.

No execution is authorized by this review file. Separate user approval is required.

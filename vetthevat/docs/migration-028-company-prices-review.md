# Price schema replacement after rollback

File: `database/migrations/saas/028_company_price_intelligence_syntax_fix.review.sql`

SHA-256: `aaa7126b98a255d004c1dbc23873978119488f112bc30629de930d91d65e7cce`

Exact target: `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, `D:/vetthevat.saas-dev/cluster`, existing installation. No other target is approved.

Approved 027 failed with SQLSTATE 42601 at the trigger's CASE expression. The connection closed and a read-only `to_regnamespace` check verified that `price_intelligence` is absent. No new schema committed. File 027 remains unchanged. This replacement adds explicit CASE parentheses; all tables, RLS, grants and restrictions retain the reviewed 027 scope described in [the original review](migration-027-company-prices-review.md).

Fresh database/roles dumps, verified checksums and readable archive listing are required before this replacement is executed, even though 027 already had a backup. Before COMMIT use ROLLBACK. After COMMIT disable the price gate and prepare a separately reviewed forward correction. No restore over the live local database, stock/financial mutation, password, email or cross-company publication is authorized.

# Invoice routing command vocabulary correction

File: `database/migrations/saas/026_invoice_routing_command.review.sql`

SHA-256: `3b8bd396a5fac014975cd1561850b9a171ec967e75bc47f7aefa660e6a747792`

Target only `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, data directory `D:/vetthevat.saas-dev/cluster`. Separate exact approval is required. No Neon or production execution.

Real PostgreSQL acceptance after approved migration 025 found SQLSTATE 23514: the accepted `business.command_keys_operation_check` rejects `document.purpose`. The attempted routing transaction rolled back. Migration 025 remains unchanged.

This correction reads the installed constraint expression and adds one OR alternative for `document.purpose`. Every existing allowed ORS, VAT and banking operation is preserved verbatim. It changes no rows, roles, RLS, stock or financial records. No email, worker or provider is activated.

The reviewed runner must create fresh custom database and roles dumps, verify checksums and readable archive listing, then execute this transaction. Before COMMIT, ROLLBACK restores the original constraint. After COMMIT disable routing and prepare a separately reviewed forward correction; do not remove valid command history. No fresh-target restoration is authorized or claimed.

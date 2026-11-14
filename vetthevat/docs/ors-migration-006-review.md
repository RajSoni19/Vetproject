# ORS migration 006 stock-integrity review

The original `006_operations_ors.review.sql` remains unchanged and unexecuted. It is rejected for execution because it did not lock durable stock balances, could not enforce availability, allowed broad runtime writes, and did not bind reservations to sales-order lines and locations.

The replacement is `database/migrations/saas/006_operations_ors_stock_integrity.review.sql`, SHA-256 `60a712587434e8bfb2ac3832e911bb3d105a0e53f3fc57d6050fedc7afac379a`.

It creates the `operations` schema and 17 company-scoped tables: materials, warehouses, stock locations, stock balances, purchase requests and lines, purchase orders and lines, goods receipts and lines, inventory movements, sales orders and lines, stock reservations, transfers, fulfilments, and invoice matches. It creates the movement index and table PK/unique, foreign-key, state, quantity and availability constraints.

Every table enables and forces RLS. Runtime can read only through live `company:read` authorization and can insert only authoring records; stock balances, reservations, receipt lines, movements, transfers, fulfilments and invoice matching are database-owned. Security-definer functions hold row locks for approval, order issue, receiving, adjustment, transfer, reservation, dispatch and returns. The immutable inventory ledger rejects UPDATE and DELETE. The transaction-local authorization context remains supplied by the existing company transaction boundary.

The migration aborts unless it reaches only `127.0.0.1:55440/vtv_saas_dev` in `D:/vetthevat.saas-dev/cluster`, as `vtv_saas_operator`, on PostgreSQL 17, with Stage B and the approved provider-event inbox present, and with no existing operations schema. It has not connected to any database during review.

Execution tooling will create a new timestamped custom database dump, roles dump, archive listing and SHA-256 manifest before SQL. SQL is one transaction. If it fails or commit status is uncertain, preserve the isolated cluster and backup state; do not retry, drop or automatically roll back. A committed schema is recovered only with a separately approved forward fix or fresh-target restore.

Offline PostgreSQL 17 parsing, focused review/contract tests, full automated suite and production build passed. Real RLS, concurrency, idempotency, rollback, company-isolation and browser workflow tests remain pending approval and execution.

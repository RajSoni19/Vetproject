# Invoice purpose routing — separate approval required

File: `database/migrations/saas/025_invoice_routing.review.sql`

SHA-256: `a896aea6434140df72c679170aa8abc06fa3386de6670bde234f4c1d27ad83e5`

Only target: `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, `D:/vetthevat.saas-dev/cluster`. No Neon or production change.

Adds purpose metadata (`ors`, `vat`, `both`) keyed by company and the existing private original's document ID. A composite foreign key prevents foreign-company document links. Existing storage and duplicate SHA-256 handling remain unchanged; this migration copies no original or accounting row. No accepted ORS, VAT, banking or billing function is replaced.

FORCE RLS applies to purpose metadata and immutable audit events. The business runtime can read only authorized company records, and can write only with document write permission. Triggers independently require ORS procurement write and/or VAT invoice write permission according to the requested purpose. Updates advance the version exactly once. The service uses existing transactional command keys for replay/conflict handling. No DELETE, audit-event write or owner-function execution is granted to a login runtime.

Purpose selection is not procurement approval, receipt, VAT invoice creation/confirmation or submission. It does not alter stock. Connecting both reviewed module records to a consistent supplier-invoice identity and ingesting verified price observations remain further work; this migration does not claim those features. Existing financial records are never removed when purpose changes.

Activation is disabled by default (`SAAS_INVOICE_ROUTING_ENABLED=0`). After separately approved execution and local acceptance, a dedicated acceptance process may set the flag and exact schema checksum; schema existence alone must not enable it. No live-user activation is included in this request.

The reviewed runner must verify the exact source checksum and isolated installation, create new custom database/roles dumps, verify hashes and an archive listing, then execute this transaction. Before COMMIT, use ROLLBACK. After COMMIT disable routing and prepare a separately reviewed forward correction; preserve purpose/audit history. Restoring backups into another target requires separate approval. No fresh-target restore drill is claimed.

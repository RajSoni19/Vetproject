# Local company price intelligence — separate approval required

Exact file: `database/migrations/saas/027_company_price_intelligence.review.sql`

SHA-256: `3440d21d46645fd03a3bef6dee92fd9c9287b92f38dc07cbb26f7ead1e342463`

Only target: `127.0.0.1:55440/vtv_saas_dev`, PostgreSQL 17, data directory `D:/vetthevat.saas-dev/cluster`, existing installation identity. No other database, provider or production connection is included.

Adds company canonical product variants, explicitly reviewed supplier-description aliases and pack conversions, versioned mappings from confirmed supplier invoice lines, per-company participation preferences, transaction command keys and immutable mapping audit. Every tenant table uses FORCE RLS, composite company foreign keys and narrow runtime grants. Trigger functions repeat live permissions and compatibility checks. Products are immutable; corrections create another canonical product and explicitly remap a line/alias with its current version. No invoice, ORS, banking, stock, financial history or accepted function is rewritten.

Prices will be calculated from existing confirmed purchase invoice line net amounts after recorded discounts, with delivery excluded explicitly. No submitted price field becomes authority. Invoice quantities determine pack counts. Confirmed credit notes and their affected originals are conservatively withheld from price recommendations because a partial financial credit does not prove returned product quantity. Analytics still includes signed credits. Original credit/correction records remain intact.

The preference defaults OFF if absent; records use policy `local-price-intent-1`. This records participation intent only: sharing remains disabled regardless of that preference, with no aggregation worker, publication function or cross-company read grant. The UI must state this clearly. Privacy/security acceptance is still required before any real sharing.

No scanner approval, email, payment, stock receipt, VAT claim, demo fixture or password is created by this SQL. Manual reviewed purchase records can be matched without asserting that a quarantined attachment is clean. Unscanned documents remain restricted by the accepted document pipeline.

Execution requires fresh custom database and roles backups, checksum verification and a readable archive listing through the reviewed runner. Before COMMIT use ROLLBACK. After acknowledged COMMIT disable the price gate and prepare a separately reviewed forward correction; do not drop mappings/history or restore over the running database automatically. A fresh-target restore requires separate approval.

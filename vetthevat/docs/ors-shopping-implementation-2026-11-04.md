# ORS shopping implementation and migration approval

Implemented in the existing Next.js application. No database migration was executed, no protected database was modified, and no supplier message was sent.

## Review URLs

- Running synthetic preview: http://127.0.0.1:3100/app/ors/shop
- Preview cart: http://127.0.0.1:3100/app/ors/cart
- Preview order history: http://127.0.0.1:3100/app/ors/shopping-orders
- Authenticated application, with the existing approved local launcher: https://localhost:3444/app/ors/shop
- Authenticated cart and order history use `/app/ors/cart` and `/app/ors/shopping-orders`; details append the saved dispatch UUID.

The preview bundles the actual shopping component and application CSS, with explicitly synthetic HTTP responses and browser storage. It does not exercise authentication or PostgreSQL. WhatsApp actions are intercepted in the preview. Restart it after source changes with `npm run preview:ors:shopping`.

The authenticated app cannot currently be launched with its approved profile: `npm run local:check` reports PostgreSQL 127.0.0.1:55440 is not listening. The plain frontend `.env.local` is marketing-only with authentication disabled, so a bare `next dev` is not an authenticated substitute. Environment files were not changed.

## Required migration — approval pending

Existing review-only migration (unchanged):

`database/migrations/saas/039_ors_live_offers_whatsapp_dispatch.review.sql`

SHA-256: `7fbab90f1fb1de319140ac27cffe89251c7feb06b4df9f49cad405fa4a94b18e`

Exact permitted target encoded in the SQL: PostgreSQL 17, database `vtv_saas_dev`, address `127.0.0.1`, port `55440`, operator `vtv_saas_operator`, data directory `D:/vetthevat.saas-dev/cluster`. The script checks the existing shopping prerequisites and refuses an unexpected or already migrated target. Approval must identify this exact file, hash and target. No execution has occurred during this task.

Adds verified supplier offers, verified supplier WhatsApp contacts, supplier dispatch drafts and immutable line snapshots. All four tables force tenant RLS. No historical prices are promoted to current quotes. Company managers must record supplier-provided quote evidence, availability, pack conversion, currency, explicit VAT treatment and expiry, plus independently verified international WhatsApp contacts. The shopping catalogue continues to use existing company materials and supplier mappings.

## Rollback plan

1. Before an approved execution, verify the exact target and hashes, take a fresh private backup and verify restoration into a separately approved disposable database. No fresh backup or restore was attempted while the database is offline.
2. Migration 039 is transactional; an error before commit rolls back its changes.
3. After commit, stop marketplace writes and preserve a backup. The existing rollback is `database/migrations/saas/039_ors_live_offers_whatsapp_dispatch.rollback.review.sql`, SHA-256 `a752e609dc326f523640693f502c6b5db72320c12a5f5a70e5606996ec6f289b`.
4. That rollback only drops the four new tables and the dispatch guard when all new tables are empty. It refuses to erase real quotes, contacts or orders. Execution requires separate approval. If data exists, preserve/export it and prepare a reviewed forward repair or restore into a separate database; never overwrite the protected source.
5. Revert the application changes if needed. Existing VAT, procurement, inventory, supplier invoice, OCR, quarantine, reports and authentication implementations are retained.

## Behavior and API

- Orange/white responsive shopping, real catalogue images or honest placeholders, category navigation, search and supplier/available-quote filters.
- Supplier comparisons are always expanded on every product card. VAT-exclusive price per base unit determines the lowest comparable offer, within the same currency. No exchange-rate assumptions. Supplier selection also selects its available pack when necessary.
- Existing authenticated, tenant-scoped PostgreSQL cart API provides persistence, supplier grouping, quantities and removals. Shopping history has separate routes to preserve existing purchase-order pages.
- `GET /api/ors/shopping/offers`: current verified quote records, or an explicit unavailable state when the schema is absent.
- `POST /api/ors/shopping/offers`: purchasing-manager verification of a supplier quote for an existing product/supplier/pack mapping.
- `POST /api/ors/shopping/whatsapp-contact`: purchasing-manager contact verification; requires E.164 international format and evidence.
- `GET /api/ors/shopping/quote/:requisitionId`: owned draft repricing, quantity/stock/MOQ/pack/currency/VAT/phone validation, supplier totals and content fingerprint.
- `POST /api/ors/shopping/checkout`: requires CSRF, company permission, idempotency key, current cart version and exact reviewed fingerprint. Under cart and company quotation locks it revalidates, writes one pending draft plus priced snapshots per supplier and closes the checked-out cart. A changed quote or invalid group rejects the entire transaction.
- `GET /api/ors/shopping/orders[/:dispatchId]`: company-scoped history and line snapshots. Details rebuild WhatsApp actions only for a currently verified contact.
- Single-supplier checkout opens a reserved tab only after the order draft has saved; popup blocking leaves a usable link. Multi-supplier checkout presents separate supplier actions. Opening links never changes dispatch status or claims delivery.
- Money uses BigInt decimal arithmetic, rounding half-up per line to currency cents. Current quote entry supports currencies with two fraction digits. Supplier stock is validated, not reserved: a draft request is not supplier acceptance or an inventory movement.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed. Existing dynamic filesystem tracing warnings in storage/worker modules remain.
- All existing `*.test.cjs` plus new domain/service tests: 399 passed, zero failed, one skipped (400 total). The suite was run in-process with `node -e` because Node 22.15 cannot disable test isolation and the initial sandbox blocked spawned test processes. The archive test passed when rerun with process permissions.
- `node tests/browser-ors-shopping.cjs`: 17 passed, zero failed; actual installed Chrome, real component and CSS, synthetic HTTP. Machine-readable results: `docs/test-results/ors-shopping-browser.json`; desktop/mobile screenshots alongside it.
- Real authenticated PostgreSQL draft/cart durability and database RLS cross-company denial: blocked by offline PostgreSQL and pending schema approval. The fixture foreign-company denial is only an HTTP simulation; service tests verify scope checks and company parameters but do not prove live RLS.
- Real WhatsApp supplier delivery: not attempted. No unofficial automation is used.

## Files changed by this implementation

Application: `app/globals.css`, `components/ors-product-marketplace.tsx`, `components/ors-offer-manager.tsx`, `components/ors-workspace.tsx`, `lib/ors-marketplace.ts`, `lib/workflow-routes.ts`, `lib/server/ors/marketplace.ts`, `lib/server/ors/shopping.ts`, `lib/server/ors/shopping-http.ts`, `package.json`.

Tests/reporting: `tests/ors-marketplace.test.cjs`, `tests/browser-ors-shopping.cjs`, `tests/fixtures/ors-marketplace-browser.tsx`, this report, `docs/test-results/ors-shopping-browser.json`, `docs/test-results/ors-shopping-regression.log`, `docs/test-results/ors-shopping-build.log`, `docs/test-results/ors-shopping-1440.png`, `docs/test-results/ors-shopping-390.png`.

The workspace has no Git repository metadata, so this inventory records files edited or created during this task rather than a Git diff. Existing migration SQL was inspected and hashed, not edited or run.

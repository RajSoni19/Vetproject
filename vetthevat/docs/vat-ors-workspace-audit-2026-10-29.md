# VAT and ORS workspace audit

Audit date: 2026-10-29  
Application: `https://localhost:3444`  
Database identity verified by the local workspace launcher: `127.0.0.1:55440/vtv_saas_dev`

This is the requested pre-implementation feature-to-route-to-API-to-table map. No database writes or migrations were performed for this audit.

## Current route and service map

| Area / feature | Current route and UI | API / service | Existing PostgreSQL records | Current finding |
|---|---|---|---|---|
| Authenticated shell and area toggle | `app/app/layout.tsx`; `components/server-workspace.tsx`; VAT/ORS header links | `requireWebSession`, `company-selection`, company-scoped request context | `web_auth.sessions`, `web_auth.companies`, `web_auth.company_memberships`, `saas.company_selections`, `saas.subscription_entitlements`, `saas.audit_events` | Session and tenant checks are server-backed. Header toggle exists. Main navigation is split by route prefix, with companies/team/settings/subscription/support shared. |
| VAT invoices and review | `/app/invoices`, `/app/invoices/new`, `/app/invoices/[id]`, `/app/invoices/upload`, `/app/documents` | `/api/business/*`; `invoiceService`; invoice review/document services | `business.invoices`, `business.invoice_lines`, `business.invoice_revisions`, `business.review_issues`, `business.invoice_attachments`, `saas.documents`, `saas.document_inspections` | Real company-scoped workflows exist. Confirmation refuses unsafe quarantined attachments. |
| VAT overview and reports | `/app/vat`, `/app/reports`; `components/server-workspace.tsx` routes these through `ManualInvoiceWorkspace` when enabled | `/api/business/*` report handlers; `vatReport`; client VAT report/export code also exists in `app/app/vat/page.tsx` | Confirmed `business.invoices` and `business.invoice_lines`; VAT periods/adjustments where enabled | Two implementations coexist: an older browser-local VAT page and the newer authenticated server workspace. The authenticated shell selects the server path when enabled, so route ownership should be consolidated. |
| VAT/business analytics | `/app/dashboard`, `/app/analytics`; `ServerAnalytics` | `/api/business/analytics`; `analyticsService.read` and `exportAnalytics` | Confirmed invoices/lines, counterparties, bank transactions/allocations, operations orders/inventory, price intelligence | Initial loading is already triggered by `useEffect` when the authorized company changes. Filter edits only update component state; results are applied on the explicit “Load analytics” submit. Several metric values are deliberately `null` if permission or qualifying source records are missing; the UI currently renders both missing data and unavailable prerequisites as “Unavailable”. |
| ORS ordering/stock administration | `/app/ors`; `components/ors-workspace.tsx` | `/api/ors/[...segments]`; `operationsHttp`; `operationsService` | `operations.materials`, `warehouses`, `stock_locations`, `purchase_requests`, `purchase_request_lines`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `stock_balances`, `inventory_movements`, `stock_reservations`, `fulfilments`, `sales_orders`, `sales_order_lines`, `invoice_matches`; suppliers/customers in `business.counterparties` | The route is currently an administrative/operations form page (supplier/customer, material, warehouse, location, purchase request, receipt, transfer, adjustment, sales order, invoice match). It is not a grocery catalogue or cart. Existing APIs are authenticated, permission-scoped and company-scoped; write commands use versioning/idempotency and audit events. |
| ORS catalogue | `/api/ors/catalogue`; no shopping UI | `operationsService.catalogue` | `operations.materials` and inventory location tables | Catalogue exposes internal materials/SKUs and units, but no grocery category, image, supplier offer, product-specific pack conversion, live availability/price offer, or storefront metadata. Do not infer product imagery, pack sizes, supplier pricing, or availability. |
| ORS requests and POs | `/api/ors/purchase-requests`, `/api/ors/purchase-orders`; rendered in `/app/ors` | `createPurchaseRequest`, approve/reject, `createPurchaseOrder`; reviewed PostgreSQL functions issue orders | `operations.purchase_requests` has one supplier per request; request lines are materials and quantities. POs and lines are supplier-specific. | Real request→approval→PO flow exists. There is no multi-supplier master requisition, authorized buyer assignment, buyer inbox, shopping-cart request, or line-level actual purchase/substitution record in the audited tables. |
| ORS receiving and inventory | `/api/ors/goods-receipts`, `/api/ors/inventory`; forms and tables in `/app/ors` | `receiveGoods`, `operations.receive_purchase_line`, inventory procedures | `operations.goods_receipts`, `goods_receipt_lines`, `purchase_order_lines`, `stock_balances`, `inventory_movements` | Existing receipt flow owns inventory posting. The new workflow must call/reuse it once and must not also post a second stock movement for the same receipt. |
| Supplier price intelligence | `/app/ors/prices`; `ServerSupplierPrices` mounted by `ServerWorkspace` | `/api/business/supplier-prices`; company price service | `price_intelligence.products`, `line_matches`, `aliases`, `events`, `commands`, `consent`, plus confirmed purchase invoice lines and `business.counterparties` | This is verified historical purchase-price matching, not a supplier quote/catalogue. It must be preserved and presented as historical observations. Current page mounting depends on the VAT/manual-invoice feature flag rather than the ORS navigation branch. |
| Team/buyer identity | `/app/team`; `ServerTeamWorkspace` | `/api/account/team`; reviewed team invitation services | `web_auth.users`, `web_auth.company_memberships`, `saas.team_invitations` | Membership and invitations exist, but no purchasing assignment or authenticated buyer inbox exists. Eligible buyers must be selected from active company members and checked on every command. |
| Entitlement and company selection | Shared shell and onboarding pages | `/api/account/companies`, `/api/account/company-context`, `/api/account/company-selection`; `requireBusinessScope` and entitlement permissions | `saas.company_profiles`, `saas.billing_accounts`, `saas.subscription_entitlements`, `saas.trial_history`, `saas.company_selections`, membership/session tables | Migration 029 is present and the trial path was previously verified. New ORS pages and APIs must continue to check selected membership, permission and entitlement on the server. |

## Data structures needed for the requested shopping workflow

The existing tables support individual material requisitions, purchase orders, receipts, inventory and invoice-based historical price comparisons. They do not currently represent:

- Storefront product categories, display images, product-specific selectable units, and explicit pack conversions tied to supplier/product offers.
- A persistent cart with validated line-level unit/conversion and supplier selection.
- One master requisition containing multiple supplier groups, item instructions, required date and priority.
- A buyer assignment, buyer inbox, lifecycle transitions, actual quantities/prices, substitutions, unavailable items and corresponding immutable audit history.
- A transactional, idempotent link from a completed supplier group to the existing purchase-request/PO/receipt flow.

These are schema requirements, not merely presentation work. The migration must preserve tenant RLS, permission checks, same-company membership foreign keys, command idempotency, audit events, and transaction-safe links to the current receiving logic. No migration was applied in this audit.

## Implementation plan and verification boundaries

1. Retain the authenticated header switch while giving VAT and ORS distinct navigation trees and dashboard entry points.
2. Consolidate VAT pages on the server-backed invoice/report services; make analytics filters automatically apply with initial load, company change, and filter changes; distinguish empty, unavailable, and failed results.
3. Build the ORS storefront around verified company data only. Until product offers and conversions exist, show truthful empty states instead of invented grocery products, prices, supplier stock, or images.
4. Add transactional cart/requisition/assignment lifecycle structures and APIs only in a reviewed migration package. Reuse current purchase orders, goods receipts, inventory functions, invoice matching, and price intelligence.
5. Keep the current supplier/material/warehouse/location/stock/invoice-match functions in a clearly separated ORS administration route.
6. Add locale keys for newly introduced UI and use the existing locale provider; include Arabic direction-aware layout.
7. Run real Chrome and PostgreSQL-reconciled acceptance flows after migration approval. No workflow is called complete based on static UI or compilation.

## Source files inspected

- `app/app/layout.tsx`, `app/app/ors/page.tsx`, `app/app/ors/prices/page.tsx`, `app/app/vat/page.tsx`, `app/app/analytics/page.tsx`
- `components/server-workspace.tsx`, `components/ors-workspace.tsx`, `components/server-analytics.tsx`, `components/server-supplier-prices.tsx`, `components/manual-invoice-workspace.tsx`
- `lib/workspace-navigation.ts`, `lib/server/ors/http.ts`, `lib/server/ors/contracts.ts`, `lib/server/ors/services.ts`
- `app/api/ors/[...segments]/route.ts`, `app/api/business/[...segments]/route.ts`, `app/api/business/analytics/route.ts`, `app/api/business/supplier-prices/route.ts`
- `lib/server/saas/analytics.ts`, `lib/server/saas/invoices.ts`, `lib/server/saas/transactions.ts`, `lib/server/saas/entitlements.ts`, `lib/server/procurement/service.ts`
- Local Next.js App Router documentation for fetching and Route Handlers under `node_modules/next/dist/docs/01-app/01-getting-started/`.

# Stage B implementation plan — 23 October 2026

Status: plan only. No Stage B migration, financial API activation, real email,
external service provisioning or deployment is authorized by this plan.

Continue using the isolated `127.0.0.1:55440/vtv_saas_dev` instance and the
verified Stage A authorization/transaction boundary. Keep the old authentication
database, published mobile services and production systems separate. Preserve the
existing branded frontend and calculation/export code where behavior is correct.

## 1. Review and approve the next schema increment

Prepare new, additive Stage B SQL separately from committed migrations 001/002.
Propose normalized supplier/customer records, contacts/addresses/VAT registrations,
invoices and ordered line items, revisions, original attachments, extraction jobs
and page results, review issues, duplicate fingerprints, tax codes/treatments and
calculation snapshots. Include tax/reporting periods and draft report snapshots
only where their command behavior is implemented and tested.

Use UUID stable references, composite tenant foreign keys, exact NUMERIC money /
quantity fields, bounded text, explicit states/versions, unique idempotency and
fingerprint constraints, immutable revision/audit history and forced RLS. Unknown
VAT treatment and missing observations must remain representable in drafts.
Do not encode an unknown amount or tax rate as an invented zero/default.

Show exact target/owner/roles, SQL checksum, all affected objects and existing
records, a pre-change backup and forward-recovery strategy. Obtain separate
approval before executing any Stage B SQL. Do not rewrite or reapply 001/002.

## 2. Private originals and secure upload

- Approve an isolated versioned private S3-compatible service and bucket; review
  ACL/bucket policy, service credentials, access restrictions, retention and
  backup/recovery. The current adapter accepts only its explicit local endpoint
  and does not fall back to production AWS credentials.
- Prove real provider write/read/version/conditional-write behavior. Preserve the
  original bytes and SHA-256 under server-generated company/document IDs.
- Implement the upload endpoint around the Stage A request and scoped transaction
  wrappers. Enforce supported PDF/JPEG/PNG/WEBP signatures, actual streamed size,
  file-name bounds, idempotency and company ownership. Show progress and durable
  upload/quarantine state in the existing upload UI.
- Keep files quarantined until an approved isolated scanner and bounded decoder
  produce a trusted inspection for the exact digest/version. Missing, failed or
  timed-out scanning must deny access and extraction. Do not treat a file header
  as a clean verdict. Add privileged worker commands through separately reviewed
  grants; the ordinary runtime must not promote its own upload to clean.
- Test private authorized downloads, cross-company IDOR, corrupt originals,
  retries, object-write/SQL-commit failures and orphan reconciliation. No object
  deletion on an ambiguous COMMIT; no Vercel filesystem persistence.

## 3. Extraction and human review

Reuse the existing PDF.js/Tesseract parsing and source-observation models, but run
untrusted files in a configured worker with resource limits and restricted
network/CPU/memory. Implement leased durable jobs, bounded attempts, timeouts,
failure recovery and stale-lease rejection. Read only verified clean versions.

Store page-level text/results, field confidence and provenance separately from
reviewer edits and server-calculated amounts. Cover supplier/customer identity,
addresses/VAT numbers, invoice/due dates, currency/direction, item quantity/unit /
price/discount/treatment, observed totals, payment and PO references. Preserve
repeated identical items and mixed tax treatments. Flag missing/ambiguous fields,
supplier mismatches, duplicates and non-reconciling totals. Never auto-confirm
an invoice when OCR finishes. No universal VAT-rate assumption.

The existing review screen should edit observations, assign real tenant contacts,
recalculate and explicitly submit confirmation. Failed extraction must preserve
the original and allow safe manual review or retry.

## 4. Authoritative invoices and contacts

Implement parameterized tenant-scoped repositories and commands behind verified
permissions for supplier/customer CRUD, manual drafts, purchase/sales invoices,
attachments, review/confirmation, search/filter/sort and bounded pagination.
Use optimistic versions plus deterministic locks and transaction idempotency.

Prepare legal state transitions: Draft, Uploaded, Processing, Review Required,
Confirmed, Failed/Rejected, and later partial/full payment and void/correction
states. Confirmation checks original/provenance, required fields, tenant links,
duplicates and exact calculation consistency. Confirmed financial facts use
revision/correction/credit-note workflows rather than destructive editing.

Keep extracted, approved and recalculated values distinct. Record actor, stable
IDs, before/after version and timestamps in immutable audit/revision history.
Implement CSV/XLSX/PDF exports using server-authorized real records. Never grant
access based on a local browser company ID or import legacy browser records
without explicit verified ownership mapping.

## 5. VAT engine and reports

Extend the existing exact decimal/BigInt calculation contracts with reviewed,
configurable treatment/rate and rounding policies: inclusive/exclusive prices,
discounts, mixed treatments, credit notes, zero-rated, exempt and outside-scope.
Preserve source values and flag unresolved treatment. Golden fixtures must cover
line/group/invoice rounding and reconciliation without deriving expected results
from the implementation itself. Accounting/tax policy needs owner review.

Aggregate only eligible confirmed/corrected invoice events by company, direction,
currency and period. Keep draft/unapproved extraction, cancelled records and
purchase/sales orders out of VAT totals. Prepare auditable VAT return drafts and
exports, including adjustment/correction lineage and protection against duplicate
reporting. Replace dashboard browser aggregates only after these real queries
pass. This does not establish HMRC MTD compliance or authorize submissions.

Reporting/dashboard breadth and banking reconciliation remain the subsequent
Stage C delivery; Stage B defines and verifies their invoice/tax inputs. Real
bank/provider integration is not part of the authorization here.

## 6. Entitlements and shared transaction boundaries

Before enabling new invoice creation, provide a real operator/provider-verified
subscription entitlement source. Preserve Basic/Starter/Growth policy. Serialize
account-wide quota and company/member capacity checks in the same authoritative
transaction as invoice creation. Manual and uploaded invoices count once; retry,
review and revision do not double-charge usage. No client flag activates billing,
ORS entitlement or paid access. Use explicitly identified test entitlements only
inside isolated integration fixtures; do not imply payment verification.

## 7. Interfaces for complete ORS

Stage B must provide stable company-scoped contact, document, invoice/revision,
currency, unit/treatment and audit references for these later modules:

| Later module | Required integration boundary |
| --- | --- |
| Procurement | Request/approval → PO/items → receipt/items → supplier invoice links; no PO automatically treated as a VAT invoice |
| Receiving / matching | Partial receipts, damaged/rejected quantities, price/quantity/tax tolerances, two-/three-way match issues requiring review |
| Inventory | Material/product/UOM/warehouse/location IDs; append-only movement references, exact quantities/costs and transactional balance/reservation locks |
| Sales / fulfilment | Sales order/items → reservation → pick/pack/dispatch/delivery → customer invoice links; partial fulfilment and returns/corrections retain lineage |
| Banking | Confirmed invoice direction/currency/outstanding amount and correction rules; later locked allocations/reversals must not over-allocate |

Model link quantities/values for partial and multiple invoices/receipts. Unique
source-event/idempotency keys prevent duplicate invoice, stock or VAT postings.
All linked foreign keys include company identity. Do not fabricate courier,
banking, delivery or supplier events. Full procurement/inventory/sales workflows
remain separate staged implementations and approval packets.

## 8. Integration and acceptance gates

1. Approve Stage B migration and isolated object/scanner/OCR services separately.
2. Test real PostgreSQL and private provider behavior, not just injected adapters.
3. Race-test last quota slot, duplicate upload, repeated job completion, stale
   lease, conflicting invoice confirmation and cross-company links.
4. Verify permissions and forced RLS for every new table/command; prove denied
   requests cause no persistent side effects or file disclosure.
5. Verify durable refresh/restart, private original integrity, mixed-rate VAT,
   manual correction/revisions, contacts, reports and exports with independent
   expected results. Keep service tests distinct from unit tests.
6. Connect the existing frontend incrementally with loading/empty/error/success
   states, version conflicts and permission-aware controls. Run desktop/mobile
   browser tests with real isolated services and no authentication bypass.
7. Run TypeScript, complete automated suite, production build and dependency
   checks. Enable only the endpoints whose authorization AND persistence tests
   pass. Missing external services keep their endpoints fail closed.

Stage B is not started by this document. No Stage B migration, financial API,
production credential, email, paid payment flow or deployment has been enabled.

# ORS supplier invoice extraction — implementation and acceptance evidence

Status: implementation prepared; migration and full persisted-confirmation acceptance are pending explicit approval. No schema migration was executed. The new endpoints are disabled unless both the feature flag and exact migration SHA-256 match.

## Implemented behavior

- ORS now includes **Upload Supplier Invoice**, document selection, automatic polling after upload, and an editable product review table.
- Upload reuses `/api/business/documents`, bounded MIME/signature validation, content-hash deduplication, quarantine, the provider-neutral original store, ClamAV inspection and durable OCR jobs. Supported intake formats remain PDF, JPEG, PNG and WEBP.
- Existing VAT document purpose is preserved: an existing VAT-only original becomes `both` when deliberately uploaded into ORS; an existing `both` purpose stays `both`.
- The parser reads labelled pipe, tab, aligned-space and single-space tables, reordered columns, repeated headings and multiple pages. Repeated products remain separate invoice rows. Existing explicit five-column tables remain supported.
- Header observations include supplier, invoice number, invoice/due dates, currency, subtotal, VAT and total. Conflicting or absent observations remain null.
- Each product retains SKU, description, quantity, unit, unit price, discount amount, VAT rate/amount and net line total where identified, plus original text, page, row and OCR confidence. Unknown confidence stays null. Unresolved text is surfaced for acknowledgement with a page/row reference.
- SKU and normalized-name suggestions populate when extraction is loaded. Supplier matching also consults reviewed mappings and, when shopping is enabled, existing `shopping_supplier_products.supplier_sku` mappings. Ambiguous matches remain unmatched.
- Reviewers can select an existing material, retain an unmatched row, explicitly create a material after a confirmation dialog, or explicitly remember a supplier code mapping. Existing mapping/catalogue rows are never overwritten by extraction.
- Fixed-point arithmetic checks quantity × price, absolute discount, VAT rate/amount, line totals, subtotal, VAT total, grand total, ISO currency and currency precision. Missing values and uncertain evidence remain review issues. Percent discounts are not silently interpreted as absolute amounts.
- Optional PO linkage verifies company and supplier. Row matching checks product identity and exact aggregate quantities, including repeated products against the same PO line.
- Confirmation requires correction or individual acknowledgement of every current issue. The server recomputes issues and owns original evidence/warnings; submitted replacements for evidence are ignored.
- Reviewed lines are persisted as an ordered JSON array on one company/document review record. This preserves repeated products, unknown fields and original row evidence. Revisions have immutable database event snapshots plus business audit events.
- Upload hash deduplication, command idempotency, version checks, document locks and a unique supplier/invoice-number identity prevent duplicate records and line appends on retries.
- Confirmed reviews are immutable. No receipt, stock movement, payment, business VAT invoice or VAT report entry is created by extraction or ORS confirmation. VAT reports continue to count their canonical existing `business.invoices` records only; ORS review rows are not another VAT source.

Primary code: `lib/ors-invoice-extraction.ts`, `lib/server/ors/supplier-invoices.ts`, `lib/server/ors/supplier-invoice-http.ts`, `components/ors-supplier-invoices.tsx`. Mounted through the existing ORS HTTP controller and workspace. `workers/processing.ts` now asks Tesseract to preserve inter-word table spacing.

## Evidence obtained

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript and production Next build | Passed; existing dynamic-filesystem tracing warnings remain | `.supplier-invoice-build.log` |
| Focused extraction, financial, ORS, routing and worker regressions | 41/41 passed | `.supplier-invoice-focused.log` |
| Supplier extraction/server tests alone | 12/12 passed, including server-owned evidence, acknowledgements, permission/quarantine checks and idempotent retries | `tests/ors-supplier-invoices.test.cjs` |
| Real isolated ClamAV + OCR, two-page PDF | Clean, scanner `ClamAV 1.5.4/28169`; all 3 rows extracted, repeated product preserved, mismatched grand total detected | `test-results/ors-supplier-real-processing.json`, `test-results/supplier-multipage.pdf.ocr.json` |
| Real isolated ClamAV + OCR, PNG | Clean; all 3 rows extracted, repeated product preserved, mismatched total detected | `test-results/supplier-lines.png.ocr.json` |
| Installed headless Chrome, actual React review component | Passed: three rows, page evidence, matching, unmatched retention, correction, acknowledgements, draft/confirm controls and confirmed read-only fields; zero implicit catalogue writes | `test-results/ors-supplier-browser.json` |
| Real PostgreSQL and real local original-storage adapter | Passed for PDF and PNG: retry/content deduplication, one inspection job, quarantine blocks, company isolation, no VAT invoices or stock movements | `test-results/ors-supplier-postgres.json` |
| Migration and rollback SQL grammar | Parsed as 27 and 16 PostgreSQL statements; not executed | `libpg-query` |
| Wider regression suite at the initial full run | 379/380 passed; one failing string assertion in untouched `tests/i18n.test.cjs:66`, expecting an older VAT route expression in `components/server-workspace.tsx` | `.supplier-invoice-tests.log` |

The Chrome component test explicitly simulates HTTP responses. It is not evidence of an end-to-end browser-to-PostgreSQL confirmation. The real PostgreSQL test exercises the existing upload/storage/quarantine path in one rollback transaction; it does not claim that the new tables were tested. Disposable test identities, memberships and entitlement fixtures remain; document, queue and document-audit test writes were rolled back. Synthetic originals are retained in the temporary directory recorded in its JSON report.

Only the isolated processor was started for ClamAV/OCR tests; database queue consumers were not started, and preexisting document queues were not drained. Original source pages and synthetic fixture files are retained under `docs/test-results/`.

## Migration for approval

Target: PostgreSQL 17, `vtv_saas_dev`, `127.0.0.1:55440`, session role `vtv_saas_operator`, data directory `D:/vetthevat.saas-dev/cluster`. Both files verify that target and refuse other environments. These files are development-target candidates, not production migration scripts.

| File | SHA-256 |
| --- | --- |
| `database/migrations/saas/036_ors_supplier_invoice_lines.review.sql` | `1e513c9f8bb2a73613c9365537d04b67581906aab3c5b970ed371134118588cd` |
| `database/migrations/saas/036_ors_supplier_invoice_lines.rollback.review.sql` | `d03ad92c5c67d9d0004567e6417245940d5a673a832b6f52538a65599ed61967` |

Machine-readable target and hashes: `test-results/ors-supplier-migration-manifest.json`.

After explicit approval, verify the hash and execute only the forward file using the existing operator connection, with `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55440 -U vtv_saas_operator -d vtv_saas_dev -f database/migrations/saas/036_ors_supplier_invoice_lines.review.sql`. Do not place passwords in a command or log.

Then configure the server process:

```text
SAAS_ORS_SUPPLIER_INVOICES_ENABLED=1
SAAS_ORS_SUPPLIER_INVOICES_SCHEMA_SHA256=1e513c9f8bb2a73613c9365537d04b67581906aab3c5b970ed371134118588cd
```

Existing ORS, manual invoice/document and invoice-routing activation must already be enabled. A trusted processing host and durable inspection/extraction consumers must be running for automatic completion in the application.

Rollback: disable the feature flag and restart the application first. The reviewed rollback file requires separate approval and refuses to run if any review, revision event or supplier mapping exists. For an empty feature schema, execute that exact rollback file against the same pinned target. If data exists, retain/export it and prepare a separate data-preserving rollback; do not bypass its guard. Originals and existing VAT/ORS tables are not removed by the prepared rollback.

## Remaining acceptance work after approval

Run a real authenticated browser upload through clean inspection and durable OCR into the new PostgreSQL review tables. Confirm, reopen and compare the saved header, all repeated/multi-page lines, evidence, acknowledgements and original attachment. Verify the new forced-RLS policies, concurrent retries, stale versions, duplicate invoice numbers across separate originals, mapping conflicts, immutable event snapshots and confirmed records. Exercise supplier/PO mismatch and changed catalogue permissions. Compare VAT report, payment and stock baselines before and after confirmation.

These checks remain required before calling the requested end-to-end success criterion complete. No production deployment or automatic financial posting was performed.

Reproducible checks:

```text
npm run test:ors:supplier-invoices:fixtures
npm run test:ors:supplier-invoices
npm run test:ors:supplier-invoices:browser
npm run test:ors:supplier-invoices:pg
wsl.exe -- bash -lc 'bash /mnt/d/vetthevat/tests/run-supplier-processing-smoke.sh'
```

The processor test refuses to replace an existing processing socket. The parser deliberately leaves unsupported/free-form or ambiguous layouts unresolved for human review rather than fabricating line values. The current review limit is 500 lines and the existing document limit is 20 pages/10 MB. Only GBP/EUR/USD currencies can be posted through the existing separate VAT invoice service; ORS review validation supports ISO currency precision independently.

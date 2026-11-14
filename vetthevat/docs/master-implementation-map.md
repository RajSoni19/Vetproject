# Master implementation map

This is an incremental implementation, not a production completion claim.
Stage A must pass its migration approval and actual service tests before Stage B.

| Area | Independently inspected baseline | Implementation sequence |
| --- | --- | --- |
| Authentication | Real PostgreSQL users/Argon2id/sessions; local runtime resolvers exist. Read-only catalog inspected; existing test DB contains records. | Preserve code; fresh isolated instance for SaaS schema; no account/password copy or email-based identity mapping. |
| Authorization | Auth checks verified email/status/revocation and software administrator separately. Small business foundation uses session-hash RLS. | A: normalized company permissions, procurement/inventory roles, scoped transaction context, forced RLS. No global admin bypass of company membership. |
| Financial API | Stage 1 implementations are injected ports; route uses undefined dependencies and Proxy denies it. Old `vat` SQL drafts include retired Firebase identity/broker assumptions. | A: new isolated foundations. B/C: adapt commands and wire only after real PG race/isolation tests. Do not execute old drafts. |
| Invoices / contacts | Existing frontend, exact server calculation contracts and revision/quota command logic. Browser storage remains authoritative in the frontend. | B: authoritative contacts, invoices/revisions, uploads, review, correction and tax snapshots; ownership-approved migration only. |
| Parsing / OCR | Existing digital PDF parsing, Tesseract/browser pipeline and development-only server adapters. No approved hostile-file sandbox, scanner or durable extraction worker. | A: durable private originals + quarantine contract. B: isolated scan/OCR jobs, page results and review; never auto-confirm extraction. |
| VAT / banking / dashboard | Browser workflows and injected server commands; no durable dashboard/report integration. | C: confirmed-record reports, VAT drafts, statement imports, locked allocations and real aggregates. |
| ORS | Setup-required frontend and domain fixtures; no complete backend. | D: procurement/approval/PO/receipts. E: ledger/reservations/fulfilment/returns. F: invoice links and matching. |
| Entitlements | Approved plan catalog and unit-tested quota contracts; no verified active billing provider. | F: account-wide atomic quotas, company/member limits and ORS gates. Never activate through browser state. |
| Leads | PostgreSQL adapter, validation/deduplication/Turnstile/outbox/admin controls exist; unconfigured in current local runtime. | F: separately approved lead schema/config; real persistence tests; keep sending disabled without email approval. |
| Release | No deployment performed; public + protected routes included in local build. | G: managed PG/private objects/workers, monitoring, restore drills, final regressions and explicit deployment approval. |

Stage A proposal is a NEW cluster at `127.0.0.1:55440`, database `vtv_saas_dev`,
under `.saas-dev/cluster`. Existing `127.0.0.1:55439/vtv_web_auth_test` is read only
for this stage. No new cluster/database/migration may execute until its concrete
review packet is approved. Full business schemas are added by later reviewed
stage migrations, not hidden behind a prematurely enabled financial API.

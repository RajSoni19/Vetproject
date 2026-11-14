# Production readiness audit — 2026-10-29

Project: `D:\vetthevat`
Local application: `https://localhost:3444`
Only database probed: `127.0.0.1:55440/vtv_saas_dev`
Recommendation: **NO-GO for production deployment.** Local code checks pass, but trusted document processing, managed infrastructure, provider acceptance, and parts of the financial workflows remain gated.

## Scope and safety

- Read-only runtime/schema verification was run against the explicitly approved local development database.
- No migration or DDL was run. No production system, cloud account, VPS, DNS, hosted database, or provider was contacted.
- No secret values or customer documents were read into this report.
- This is an implementation and acceptance audit, not deployment approval.

## Verified project state

| Area | Result | Evidence and limits |
| --- | --- | --- |
| Automated suite | **PASS** | `npm test`: 310 tests passed, 0 failed. These include unit, security, migration-guard, extraction, local document storage, and fixture workflow coverage. They do not substitute for Linux worker or provider acceptance. |
| TypeScript | **PASS** | `npm run typecheck` completed with no errors. |
| Production build | **PASS** | `npm run build` completed on Next.js 16.4.2; 69 static pages generated and server routes enumerated. This is not a deployment or runtime acceptance test. |
| Local DB/schema guard | **PASS** | `npm run local:check` verified host, port, database, role/install identity and the expected invoice, ORS, routing, pricing, onboarding, automatic trial, team, and support schema. Read-only. |
| Current local browser service | **BLOCKED** | `npm run local:workspace` refused to start because port 3000 was occupied. Node listeners were then visible on 3000/3444/8025, but the sandbox denied process command-line inspection; Windows Schannel failed before HTTPS returned an HTTP response. No process was stopped. Ownership and current browser behavior remain unverified. |
| Quarantine and authorization | **PASS in code / prior local workflow evidence** | `lib/server/saas/documents.ts` stores originals privately in quarantine, verifies hashes, checks tenant authorization, and permits retrieval only after a clean inspection record. `components/server-document-workspace.tsx` keeps quarantined originals out of preview. Existing RLS and company authorization remain in use. |
| Invoice Both routing | **PASS for routing metadata queues** | Existing routed-document queue uses the same canonical document ID in VAT and ORS and does not create invoice, purchasing, or inventory records. Prior local browser/PostgreSQL reconciliation evidence is in `.launch-acceptance/invoice-both-routing-dialog.png`, `invoice-both-vat-queue.png`, and `invoice-both-ors-queue.png`. These queues are routing/review lists; they are not separate VAT and ORS document-processing state machines. |
| Manual invoice path | **PASS for manual entry** | Existing manual invoice workspace and API support manual entry without declaring a quarantined document trusted. A manual financial record is not automatically tied to every quarantined routed document. |
| Isolated processor design | **IMPLEMENTED, NOT ACCEPTED** | `workers/processing.ts`, `workers/main.ts`, `lib/server/saas/document-runtime.ts`, and `deploy/processing` implement a separate Linux scanner/decoder/OCR architecture with bounded PDF/image handling, ClamAV signature-age checks, timeouts, page/pixel limits, non-root/systemd isolation, and failure states. Actual service execution is required before production use. |
| Local processor availability | **BLOCKED** | `npm run local:check` found `clamd`, `freshclam`, `pdfinfo`, `pdftoppm`, `identify`, `convert`, and `tesseract` absent from PATH. Windows Tesseract and English data are present but do not provide trusted inspection. The local document worker is stopped; uploaded originals remain quarantined. `npm run local:workers` fails closed and claims no jobs. |
| Physical mobile camera | **BLOCKED** | Android Chrome and iPhone Safari devices were not available for this audit. Browser file-input/capture flows do not establish physical rear-camera behavior. Existing capture code provides native capture hint/fallback; no universal camera-only guarantee is made. |
| Production infrastructure | **BLOCKED** | `deploy/` contains offline runtime, service, Nginx, and operations templates. This machine is Windows without usable Docker/WSL, Nginx, or systemd; Linux service install, TLS, private object storage, monitoring, and disaster recovery have not been executed. |
| External providers | **BLOCKED / disabled** | Local launcher reports external providers disabled. Real Stripe, production SMTP, public contact/lead intake, and hosted storage/worker paths require environment-specific credentials and acceptance. None were contacted. |

## Dependency map and required acceptance

1. **Authenticated ingestion** — `components/invoice-capture-upload.tsx` -> `components/server-document-workspace.tsx` -> `lib/server/saas/invoice-http.ts` -> `lib/server/saas/documents.ts`. Authentication, entitlement, company scope, size/type limits, private storage, hash verification, and `saas.document_jobs` remain prerequisites.
2. **Trusted inspection and OCR** — `workers/main.ts` claims durable work through `lib/server/saas/worker-store.ts` and `lib/server/saas/document-worker.ts`; OCR/inspection is delegated through `lib/server/saas/document-runtime.ts` to `workers/processing.ts` over a protected Unix socket. The socket, database role, Linux tools, current ClamAV database, TLS/object-store configuration and lease/retry behavior must be exercised on a disposable Linux environment before enabling the worker.
3. **Human review** — extraction parsing in `lib/server/stage1/extraction.ts` produces review suggestions/warnings. Current OCR text is not trusted business data. Authorized users must verify supplier, invoice number/date, currency, tax bases/rates/amounts, totals, and line items before saving financial records. OCR confidence is limited and extracted values must never confirm VAT or receive inventory automatically.
4. **Financial effects** — manual VAT records use the existing `business.invoices` workflow; ORS purchasing/receipts/inventory use existing `operations.*` modules and routes. Invoice upload/routing must remain side-effect free. A confirmed VAT invoice or goods receipt must use its existing authorization, idempotency, audit, and reconciliation path exactly once.
5. **Both-purpose review** — `invoice_routing.purposes` records one canonical document purpose and audit event. The shared queue exposes the same document under the VAT and ORS views. It does not store separate per-module review/processing states. Separate independent states, field approvals, or automated linkage would require a reviewed schema/API design; no migration was prepared or run as part of this audit.
6. **Release operation** — `deploy/README.md`, `deploy/architecture.md`, `deploy/runbook.md`, `deploy/operations.md`, and `deploy/ci/processing-acceptance.cjs` are the operator starting points. Release requires a fresh approved managed schema/roles, pinned Linux build/runtime, private object store policy, separately configured mail/provider roles, alerting, backup verification, restore rehearsal on a specifically authorized disposable target, and complete browser/PostgreSQL acceptance.

## Change made during this audit

`lib/i18n/catalog.ts` had inconsistent message-key sets: non-English locale catalogues lacked the `complete` label, and several partial locales lacked analytics labels, making the catalogue contract fail. I added localized coverage labels and English fallback strings for missing analytics keys. The non-English locales remain correctly labelled `partial`. The full 310-test suite and typecheck pass after this repair. This does not complete the product translation catalogue; many application routes still contain untranslated UI text and require a separate complete coverage audit.

## Acceptance status

| Acceptance area | Status |
| --- | --- |
| Build, typecheck and automated suite | **PASS** |
| Local approved DB identity/schema guard | **PASS** |
| Quarantined upload and authorization design | **PASS in code; Linux clean scan unavailable** |
| Both routing visible in VAT and ORS lists | **PASS** for one canonical document and no automatic financial side effects, per existing local browser/DB evidence |
| Clean scan, safe server preview, trusted OCR/extraction on isolated Linux | **BLOCKED** |
| Physical Android/iPhone camera capture | **BLOCKED** |
| End-to-end separate VAT/ORS review approvals and once-only financial reconciliation | **BLOCKED** where this requires workflow/schema behavior not currently present |
| Production SMTP, billing, object storage and public intake | **BLOCKED** pending approved credentials and real acceptance |
| Production deployment and restore drill | **BLOCKED**; no infrastructure was accessed |

## Release blockers and next steps

1. Run `deploy/ci/processing-acceptance.cjs` on a disposable, isolated Linux host with current ClamAV signatures and required decoder/OCR packages; verify clean, infected, malformed, oversized, timeout, retry, and safe-preview cases.
2. Provision and verify least-privilege worker/database/storage identities, Unix socket permissions, TLS, private object-store access, key rotation, service hardening, monitoring, and alerting in staging.
3. Test actual OCR outputs against synthetic invoice fixtures, confirm field-level review warnings and no unreviewed VAT/order/receipt side effects, then verify all resulting PostgreSQL references and counts.
4. Conduct physical camera tests on Android Chrome and iPhone Safari; capture permission denial, cancellation, retake, multipage ordering and upload evidence.
5. Complete route-by-route translation coverage and visual RTL review. Keep incomplete locales marked partial until reviewed.
6. Complete real provider tests (mail, billing, contact and storage), disaster-recovery backup verification and a restore rehearsal on an explicitly approved disposable target.
7. Obtain separate deployment and database change approval after the evidence above is reviewed. Do not deploy based on this audit.

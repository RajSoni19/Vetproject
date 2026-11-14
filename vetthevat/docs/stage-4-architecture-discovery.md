# Stage 4 — architecture discovery

Read-only investigation; only the three requested planning documents were created.
No application, SQL, environment, packages, production data or infrastructure changed.
No live database/provider/API was contacted. Production readiness is not established.

## Evidence ledger and inspected files

All current-project findings below reference this ledger. Verified means source or
local filesystem evidence, not an external-service test. Unknown means not established.

| Ref | Actual files / inspection |
| --- | --- |
| E1 | AGENTS.md; docs/stage-1-results.md, stage-2-results.md, stage-3-results.md, feature-checklist.md, production-readiness-audit.md read |
| E2 | package.json/package-lock.json inventory; direct installed package.json checks: Next 16.4.0, React 19.3.0, TypeScript 7.0.2; common DB/auth/storage/ESLint packages checked |
| E3 | app/ file inventory; search for route files, middleware/proxy, use server, HTTP method exports; app/app/layout.tsx `WorkspaceLayout`; app/robots.ts, sitemap.ts and layout.tsx |
| E4 | components/app-state.tsx `AppStateProvider`, `commit`, `requireCompany`, saveInvoice/saveCompany/saveSupplier/saveDocument/saveTeamMember/addTicket/changeTicket/saveSettings; lib/workspace.ts Workspace/restoreWorkspace/serializeWorkspace/persistWorkspace; lib/demo-data.ts initialization references |
| E5 | lib/domain.ts Company/Supplier/StoredDocument/Invoice/InvoiceLineItem/VATBreakdown/TeamMember/WorkspaceSettings/SupportTicket/AuditEvent/NotificationItem |
| E6 | lib/services.ts DocumentStorageService/InvoiceProcessingService/ReportExportService, demoDocumentStorageService, mockInvoiceProcessingService; lib/api/client.ts/createApiClient; contracts.ts/VetTheVatApi; android-backend.ts/AndroidBackendApi |
| E7 | database/001_initial_schema.sql definitions/policies; database/README.md; docs/android-api-integration.md |
| E8 | app/login/page.tsx `enter`, register/page.tsx submit; components/auth-form-page.tsx submit; app/app/layout.tsx provider wrapping |
| E9 | lib/document-validation.ts limits/signatures; lib/document-extraction.ts browser extraction/cancellation; components/invoice-review-workflow.tsx chooseFile/process; document-viewer.tsx URL check; document-session-restore.tsx checksum restore |
| E10 | lib/invoice-rules.ts parseInvoiceDate/validateInvoice/findDuplicateInvoice/upsertInvoice/validateInvoiceDocument; lib/money.ts and vat-calculations.ts; lib/reporting.ts buildReport; lib/report-exports.ts workbook/PDF generation |
| E11 | app/app/settings/page.tsx backup; subscription/page.tsx plans and local component state; team/support/admin source inventory and AppStateProvider persistence methods |
| E12 | next.config.ts security headers; .gitignore; root configuration filename inventory; .env.example parsed for key names only; process.env/fetch/localStorage/auth searches over app/components/lib |
| E13 | tests/invoices.test.cjs, stage2.test.cjs test inventory; load-source.cjs, browser-invoices.cjs, browser-stage2-flows.cjs and browser-stage3-flows.cjs; package scripts and E1 previous-run records |
| E14 | Installed Next docs: 01-app/02-guides/backend-for-frontend.md, data-security.md; 01-app/03-api-reference/03-file-conventions/route.md |
| E15 | SHA-256 inventory of source and D:\vetthevat-backup, excluding node_modules/.next/.git; before/after comparison; Test-Path/filename inventory for Git |

## Current architecture inventory

| Area | Finding / status | Evidence |
| --- | --- | --- |
| Frontend/server | Verified Next App Router, React/TypeScript, Tailwind. Next renders pages; the business workspace executes client-side state/services. Server rendering does not provide an authenticated business backend. | E2–E4; WorkspaceLayout |
| Executing business endpoints | Verified no app route.ts/route.js HTTP handlers, Pages API implementation, server actions or auth proxy found. Dynamic [id] page components are page routes, not business APIs. robots/sitemap are metadata endpoints, not persistence services. | E3; HTTP export/use server searches |
| Proposed API adapter | Verified unused AndroidBackendApi plus request wrapper. No application instantiation of createApiClient/AndroidBackendApi was found. Fetches in application code are the unused adapter and local blob availability check. | E6/E12 searches |
| PostgreSQL | Verified schema file exists; live instance, schema application and migration history UNKNOWN. No migration runner/script/history table implementation discovered. database/README contains a proposed psql command, not evidence it ran. | E2/E7 |
| Database driver/ORM | Verified none declared in package.json and no used DB client imports found. Installed checks found no pg, postgres, Prisma, Drizzle, Knex or TypeORM packages. | E2/E12 |
| Auth/session | Verified demo navigation/forms, no credential verification or real session lifecycle. No installed checked NextAuth/Auth core/Clerk/Firebase Admin integration, session cookie access or auth gate found. | E2/E3/E8/E12 |
| Authorization | Verified role labels and local team validation only. saveTeamMember does not establish authenticated identities; all ordinary local actions are available regardless of role. | E4/E5/E8 |
| Company isolation | Verified selected-company UI filtering and save guards. Invoices/documents remain global browser collections; anyone with browser access can inspect/change localStorage. No authenticated tenant boundary exists. | E4/E10 |
| Upload/OCR | Verified browser signatures/10 MB; extractor caps 20 PDF pages and 7.5M rendering pixels, chooser aborts after two minutes. PDF.js embedded text/Tesseract English OCR; actual source field heuristics. No server job/upload endpoint. | E9/E6 |
| Documents/download | Verified metadata is browser-persisted, originals/text session-only. Viewer checks blob URL and download is browser link. getSecureUrl is a local page path, not an authorized storage endpoint. SHA-256 reattachment cannot retrieve missing bytes. | E4/E6/E9 |
| Business persistence | Verified invoices, companies, suppliers, tickets, team, settings, notifications and audit share localStorage key vet-the-vat-workspace-v1. Reports/exports derive from those collections. Subscription details only component state. | E4/E10/E11 |
| Hosting | Verified next.config.ts headers and dev/build/start scripts only; no inspected project deployment manifest, container config, hosting binding or verified remote was found. Actual hosting/shared backend ownership UNKNOWN. | E2/E12/root inventory |
| Existing Android system | UNKNOWN. docs/android-api-integration.md asserts existing apps, but no supplied backend config/contract/access confirms it. Do not assume these apps/API exist or that their DB is PostgreSQL. | E7 versus E6/E12 |

Adapter paths present in source, **not verified external endpoints** (E6):

| Method / path in AndroidBackendApi | Method |
| --- | --- |
| GET /v1/invoices with query | listInvoices |
| GET /v1/invoices/:id | getInvoice |
| POST /v1/invoices/uploads | uploadInvoice |
| POST /v1/invoices/:id/verify | verifyInvoice |
| POST /v1/documents/:id/download-url | createDocumentDownloadUrl |

VetTheVatApi also declares company/supplier/team list and invitations but this
adapter only implements part of the interface. Manual create, draft/update, settings,
support, billing, reports and audit need real contracts; existing upload/job responses
do not prove a processing worker exists. (E6)

## Environment and infrastructure evidence

Only .env.example was found among project environment files; values were not printed.
Only these template key names were extracted (E12):

| Name | Current use / verification |
| --- | --- |
| NEXT_PUBLIC_API_BASE_URL | Referenced by unused createApiClient; publicly bundled if configured. Not a credential or a verified endpoint. |
| DATABASE_URL | Template only; no runtime DB use found. Must remain server-only. |
| APP_ENCRYPTION_KEY | Template only; no active encryption implementation found. |
| JWT_ISSUER / JWT_AUDIENCE | Template only; no active JWT verification found. |
| NODE_ENV | next.config.ts decides development unsafe-eval policy. |

Root inspection found .env.example, .gitignore, AGENTS.md, next.config.ts, package.json
and package-lock.json. No .git directory. No unrelated locations or credentials
were searched. No server, database or provider outside this repository was probed;
external infrastructure existence remains unknown. next.config.ts connect-src is
self/blob only; provider connections need approved explicit origins or a same-origin
server boundary. (E12/E15)

## Schema versus production state

Verified SQL definitions, **not verified live tables**, in E7:
app_users, companies, company_members, suppliers, documents, invoices,
invoice_line_items, vat_breakdowns, data_quality_warnings, audit_events,
support_tickets, support_ticket_messages, notifications, api_clients,
pos_registers and pos_sales. Sixteen definitions; 14 enable RLS, excluding
app_users/api_clients. Tables link users to company memberships, invoices to
supplier/document, child lines/breakdowns/warnings to invoice, messages to ticket,
and POS sales to register/invoice. (E7)

Blocking mismatches supported by E5/E7/E10:

- Local Draft is absent from invoice_status enum; incomplete draft dates cannot
  satisfy invoice_date NOT NULL. Empty strings used for absent FKs need null mapping.
- Legacy/generated IDs are not necessarily UUIDs. Status casing and timestamps
  require explicit conversion; sourceTotals, missing-rate flags, invoice versions,
  jobs, settings, invitations, subscriptions and import provenance need design.
- Supplier/document FKs do not enforce equal company ownership. Null supplier in
  duplicate uniqueness and case/whitespace normalization need explicit constraints.
- RLS relies on trusted connection settings, not membership verification; notification
  user-or-company visibility and runtime owner/bypass roles need review. RLS has not
  been executed/tested. Member role labels alone grant no business authorization.
- Invoice monetary maximum/line ranges and supported tax semantics need consistent
  application/PostgreSQL rules. Decimal line calculation should not rely on browser
  values; reviewed revision and audit integrity are currently missing.

## Entity persistence and conversion map

Local lifetime L below means initial demo defaults, then storage in this browser
profile until cleared/replaced/unavailable; it is not cross-device or durable backup.
This follows E4 `persistWorkspace`/`serializeWorkspace` for every L entry. Tables
marked proposed are not present in the inspected SQL. No actual client records were read.

| Entity / evidence | Current source/lifetime/interface | Target ownership, validation and authorization | Table/relationship and conversion risk |
| --- | --- | --- | --- |
| Companies E4/E5/E7 | Demo → L; Company, saveCompany/select | Membership-gated company access; authorized setup/edits, name/currency/legal identifiers validated | companies; source company UUID mapping; name alone never proves ownership; no existing deletion workflow |
| Suppliers E4/E5/E7/E10 | Demo → L; Supplier, saveSupplier; invoice supplier snapshots | Mandatory company owner; member with write permission; duplicate-name/VAT policy; format is not registration proof | suppliers; preserve historical invoice snapshots; legacy same ID may have scoped copies; map by source company+ID |
| Invoices E4/E5/E7/E10 | Demo → L; Invoice, saveInvoice, InvoiceProcessingService; API only list/get/upload/verify declarations | Authenticated company/supplier/document ownership; draft versus verify permission; server dates/currency/totals/duplicates; optimistic versions | invoices; retain draft/manual/POS/source review; arbitrary ID/status/FK mapping; financial mismatches quarantine, not silently confirm |
| Lines E5/E7/E10 | Embedded Invoice.lineItems → L; calculateLine | Parent-company scope; precision/qty/discount/rate validation; ordered lines preserved | invoice_line_items; no dedup of identical lines; stable child mapping and line_number, round line net before VAT |
| VAT/warnings E5/E7/E10 | Invoice.vatBreakdown/warnings/sourceTotals → L | Parent-company scope; recompute validated breakdown, preserve extraction evidence/review | vat_breakdowns/data_quality_warnings plus proposed source metadata; missing/exempt semantics not inferred |
| Documents E4/E5/E6/E7/E9 | Metadata L; original/text session only; DocumentStorageService upload returns sync metadata | Company/uploader/invoice ownership; server MIME/magic/size/decode limits; quarantine/authorized downloads | documents + private object; UUID/storage key/checksum mapping; metadata alone cannot recreate file; association must remain same-company |
| Users E5/E7/E8 | No genuine user/session store; form values not accounts; TeamMember represents local records | Verified identity linked by provider subject or secure local auth; profile email never grants identity | app_users plus proposed identity/session tables as needed; never import passwords or demo identity/lastActive as verified login |
| Memberships E4/E5/E7 | TeamMember → L; local roles/statuses only | Authenticated verified user+company; owner/admin delegation restrictions, last-owner protection; no client role trust | company_members; split local member display from identity; imported roles cannot automatically grant privileges |
| Invitations E4/E5/E7 | Invitation Draft → L, no email/token flow | Authorized inviter/company/allowed role; verified recipient redemption; token expiry/use/revocation | proposed invitations and delivery outbox; preserve draft, do not mark sent/active on import |
| Settings E4/E5/E11 | Workspace.settings[companyId] → L; WorkspaceSettings/saveSettings | Company defaults vs authenticated user's preferences separated; permission for each, profile fields not identity | companies plus proposed company_settings/user_company_preferences; shared-browser profile ownership ambiguous; explicit mapping needed |
| Support E4/E5/E7/E11 | Tickets/messages → L; addTicket/replyToTicket/updateTicketStatus | Company/participant scope; requester/agent action distinction; body bounds; authorize attachments separately | support_tickets/support_ticket_messages; author is currently string, not authenticated ID; preserve legacy message provenance/timestamps |
| Subscriptions E7/E11 | Static proposals; selected plan component memory, no billing record | Company billing authority; server verified provider events/entitlements only | proposed subscriptions/billing_events; do not import UI plan as paid/active; account-vs-company billing model owner decision |
| Audit E4/E5/E7 | Root audit and embedded invoice activity → L | Trusted server actor/company; append-only writes; admin read privileges; redact sensitive payloads | audit_events; imported activity labeled legacy/unverified, cannot become trusted server audit; duplicate histories retained/mapped |
| Notifications E4/E5/E7 | Demo → L; company read state/preferences | Define personal vs shared company notifications; recipient/server scope and read-state | notifications/proposed per-recipient reads; current shared read flag cannot prove an individual user read it |
| POS E4/E5/E7/E10/E11 | Invoice with paymentStatus → L, no live registers/payment | Company invoice rights; payment values non-authoritative unless reconciled | invoices plus pos_sales if approved; distinguish local method/status from provider transaction and register |
| Reports E10 | Derived local records; exports are downloaded artifacts, not persisted service jobs | Member/export permission, company filter enforced server-side, currencies separated, snapshot version | Queries over PostgreSQL; proposed export_jobs only when necessary; do not import workbook as authoritative full workspace |

## Tests/tools and command evidence

Commands executed in Stage 4: Get-Content on ledger files; rg --files inventory,
route/config searches, rg -n for process.env/auth/fetch/storage/API/HTTP exports;
inline Node fs reads of package manifests/environment template **names only**;
inline Node crypto SHA-256 source/backup inventories. README.md read returned
missing-file error; database/README.md exists. Absence searches return no matches,
not a verified absence of external infrastructure. (E2/E3/E7/E12/E15)

No test/build/lint/npm audit commands were rerun: Stage 4 is read-only and no source
changed. Existing package scripts support typecheck, node tests, build, Chrome
browser tests. Twenty-three named automated tests are present; Stage 3 documents
report they and Chrome/build/typecheck passed and lint failed. These are prior
results, not a new run or backend security coverage. Chrome runner uses installed
Chrome, isolated temp profiles and existing canvas/export dependencies. No tests
currently establish real unauthenticated/cross-tenant server API safety. (E1/E2/E13)

## Preservation and decision

Only docs/stage-4-architecture-discovery.md, backend-integration-plan.md and
data-migration-plan.md were added. Application/config/schema/previous docs are
unchanged; all 90 backup source/assets hashes match the pre-stage inventory.
Excluded generated/dependency folders were not validated as a backup. (E15)

Next approval: approve the conditional backend direction and provide project-owned
API/contracts/infrastructure facts. If no suitable shared PostgreSQL-backed API is
confirmed, explicitly approve a new Next server-only PostgreSQL foundation and
its dependency choices. Approval does not by itself authorize migrations, paid
provisioning, live credentials, data import or deployment; those need defined gates.

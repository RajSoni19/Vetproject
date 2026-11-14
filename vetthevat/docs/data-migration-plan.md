# Browser-local data migration and recovery plan

Proposal only. No records were exported, opened from a user's browser, uploaded,
imported, reset, deleted or migrated during Stage 4. No database/provider connection
was made. This document describes a later separately approved process.
Current-state evidence refers to E1–E15 in stage-4-architecture-discovery.md.

## Why an explicit importer is necessary

Verified current behavior: AppStateProvider loads demo defaults or restored JSON
from vet-the-vat-workspace-v1; all business collections share browser storage.
serializeWorkspace removes original blob URLs and OCR text. Settings `backup`
exports selected company/invoices/documents/suppliers/team/tickets/settings but omits
root audit/notifications and original bytes; there is no complete import/restore
workflow. These are source findings E4/E9/E11, not a read of a real workspace.

E5/E7 show arbitrary legacy IDs, embedded children/history, ambiguous identity/role
fields and draft/status differences from the PostgreSQL SQL draft. Copying browser
JSON directly into that schema would risk duplicate/invalid/unauthorized records.
Do not execute 001_initial_schema.sql or a generic restore against production.

## Proposed export and backup format

Implement only after approval: a versioned export generated locally without server
mutation. Keep original raw workspace snapshot separate from normalized payload.
Explicit consent/account context; no automatic upload on login or company switch.

| Proposed package part | Contents and handling |
| --- | --- |
| Manifest | formatVersion, export time/app version, random sourceWorkspaceId, per-file SHA-256, per-company/entity counts, original availability, supported rounding policy and monetary reconciliation; no auth tokens/secrets |
| Raw workspace snapshot | Immutable copy of actual source JSON, preserving unknown fields for later mapping; restricted access, encrypted backup policy; do not reseed or alter source during export |
| Normalized records | Companies/suppliers/invoices/ordered lines/VAT groups/warnings/source totals/documents/team draft records/settings/tickets/messages/notifications/legacy activity, each with source ID and provenance; preserve missing values |
| Original-file manifest | Source document ID/company, filename/type/size/known checksum, supplied-file checksum, available/missing/identity-unverified status; blob URLs are not originals and are excluded as recoverable file references |
| Original bytes | Separate authorized files owner supplies from active session or original source; validate later before private storage. Never infer file identity from name/size alone |
| Reconciliation summary | Invoice count and totals by source company/currency/status/approval/date; line/header/source differences itemized; no mixed-currency grand total |
| Import decisions/report | Owner-approved company mappings, identity treatment, duplicate decisions, warnings/rejections and target ID mapping; contains no session/billing credentials |

Use deterministic decimal strings for financial fields in the normalized format,
ISO date-only invoice dates and explicitly parsed timestamp instants. Preserve raw
values even when invalid/ambiguous; never silently change them to zero/today. Current
rules are GBP/EUR/USD two-decimal totals, four-decimal quantities/unit prices and
two-decimal rates/discounts, exclusive net with absolute line discounts and half-up
line net then VAT (E10). Record any owner-approved future policy/version separately.

Owner controls encrypted storage/retention/access for exports; they may contain
personal/commercial data. Keep backups outside source/Git and fixtures. Inspect
manifest and hash verification without logging invoice text or credentials. Source
backup D:\vetthevat-backup remains immutable and contains no verified DB/file backup.

## Ownership and provenance mapping

Authenticated owner approves each source company → authorized target company.
Browser-selected company, names, registration numbers and local roles are evidence
to review, not proof of legal/account ownership. Unknown mappings stop that company's
import. Do not default ambiguous companies to the first existing company.

Maintain PostgreSQL import batches and entity mappings with keys containing target
company, source workspace, source company, entity type and source ID. Map arbitrary
local IDs to server UUIDs; preserve old references for audit/export reconciliation.
Scope legacy supplier IDs by source company because restoreWorkspace may create
same-ID supplier copies for multiple companies (E4). Nested line ordering and
legitimate identical lines must survive. Remap invoice-document-supplier links only
within the approved company; dangling/foreign links need explicit correction.

Do not import demo seeds as real invoices implicitly. The existing source has no
reliable per-record demo/user provenance flag (E4/E5); ID/name matching against demo
data cannot safely distinguish an edited seed from real input. Present candidate
seed rows for owner review and preserve them in backup; do not silently drop them.

Local TeamMember/name/email/role/lastActive do not establish a real identity (E5/E8).
Keep imported team entries as untrusted legacy records or invitation drafts. Creating
memberships requires verified users and an authorized grant/invite flow. Never
import password fields, session tokens, active login claims or client roles into
permissions. The import actor comes from server session, not legacy audit strings.

Imported notifications/activity retain legacy provenance; imported audit is not
trusted server audit. Company profile email is not verified user email. Support
author strings may remain legacy labels; missing per-message IDs/timestamps require
provenance and explicit unknown values, not invented user identity/time. Proposed
plan descriptions/paymentStatus are not proof of a paid subscription/payment.

## Dry-run and decision sequence

1. **Back up and freeze a snapshot.** Preserve all source profiles/companies and
   original files. Capture snapshot hash/time and show that storage loss cannot be
   undone from metadata alone. Leave browser workspace unchanged. For a later live
   import, separately authorize a short editing freeze or version check so export
   changes are detected; no silent replacement of newer edits.
2. **Validate envelope before parsing records.** Bounded package/file/record/field
   sizes, supported version, expected structure, hashes, no executable content or
   imported authority. Validate server-side; UI checks do not establish safety.
3. **Resolve ownership/identity.** Authenticated owner maps companies and approves
   policies. Check membership and target write/import permission for every scope.
   Map IDs and child dependencies; reject missing/cross-company references.
4. **Validate dates/financial data.** Check supported currency, field precision,
   finite/range limits, positive quantity and valid discounts/rates, strict dates/
   due dates, header/line/breakdown reconciliation using authoritative decimal math.
   Preserve source totals separately. Verified import must reconcile exactly; the
   parser's 2p warning tolerance is not permission to verify a mismatch (E10).
5. **Separate acceptance paths.** Valid reviewed records are only eligible after
   authorized human review. Incomplete drafts remain drafts with nullable missing
   fields. Invalid/mismatched/unknown tax-treatment records are quarantined or
   require correction with explicit acceptance; never auto-confirm. Dates with
   ambiguous locale/timezones are flagged. Legacy times retain raw/provenance.
6. **Compare duplicates and target conflicts.** Run the rules below and require
   decisions for ambiguous candidates. No overwrite by matching UUID/email/name.
7. **Validate originals.** Match known checksum, type/signature/size/page/decode bounds
   and approval/quarantine policy. Missing originals can be represented honestly
   only if owner policy permits; mark unavailable, not stored/recovered. Legacy
   no-checksum files need human association verification and provenance.
8. **Produce a dry-run report with zero business writes/uploads.** Counts by company/
   entity/status, proposed mappings, unchanged/rejected/new/conflict counts, separate
   currency totals and line/source discrepancies, missing originals, member/invite
   handling and exact planned actions. If later storing a dry-run job/report is
   desired, authorize that separately; dry-run does not modify target business data.
9. **Approve the exact manifest/actions.** Owner reviews the snapshot hash, mappings,
   exception decisions and target backup/restore evidence before import. Changed
   source/target versions invalidate approval and require another dry run.

## Duplicate and idempotency policy

| Case | Proposed action |
| --- | --- |
| Same batch/snapshot and source mapping re-run | Return prior mapping/result; no second invoice or upload |
| Same source identity, different payload/hash | Conflict/version review; never overwrite silently |
| Same company/canonical supplier/normalized invoice number | Compare financial content/dates/originals; link to existing only after approval, otherwise conflict |
| Different companies or suppliers | Keep separate even when invoice numbers or amounts match |
| Identical repeated invoice lines | Preserve all lines and order; not a duplicate invoice rule |
| Same file checksum | Evidence of same bytes only; do not auto-merge invoice identity or cross-company access/storage permissions |
| Name/email matches existing supplier/user/company | Candidate mapping, not authority or automatic merge; owner/verified-identity decision |
| Same legacy activity occurs embedded and in root audit | Preserve references/provenance; deliberate dedup decision, never convert to new trusted actor events |

Use database unique mapping/idempotency keys and request payload digest, plus reviewed
business duplicate constraints. `findDuplicateInvoice` currently scopes by company,
supplier ID/name and normalized number (E10); target canonical supplier resolution
must preserve that intent without NULL bypass or unstable name-only IDs. Credit-note
number reuse and approved corrections need owner/accountant policy before expansion.

## Later import execution and reconciliation

Requires an explicit import approval, completed backend authorization/storage and
tested staging recovery. All new structured state goes to PostgreSQL; original
binary files go to private approved storage, with checksums/ownership in PostgreSQL.

- Snapshot target versions and approved backup identifiers. Create an authorized
  import batch and stable mappings; record trusted server audit/outcome per batch.
- Import company/supplier dependencies and invoices with children in bounded
  transactions. Per-invoice atomic write includes ordered lines, VAT/warnings,
  approved document relation and provenance. Stage batch records until complete
  when all-or-nothing user visibility is required. Retry from persisted checkpoints.
- Upload original bytes via quarantine/finalization; DB/object store are not one
  transaction. Persist states and reconcile orphan objects. Do not expose document
  availability until validated object finalization succeeds.
- No imported team entry activates account permissions; invitations and provider
  messages remain separate explicitly authorized operations. No trial/paid state
  or financial settlement inferred from browser data.
- Reconcile source/dry-run/target counts by entity, parent-child associations, ordered
  lines and IDs. Compare totals per company/currency/status/date and dashboard/export
  selections; record every approved difference. Verify actual original object hash
  and authorized retrieval. Never combine currencies without an approved FX policy.
- Test repeated import of same batch, conflicting edit, interrupted transaction,
  timeout-after-commit, missing/corrupt original and unavailable provider. Resume
  safely or report partial status; do not report complete after partial failure.
- Keep local data read-only/available for an owner-approved retention period after
  verified cutover. Clearly select local demo vs authoritative live account; no
  silent merge/fallback or reseeding. Old browser tabs cannot overwrite server state.

## Rollback and user recovery

Before later execution: source snapshot, original package, target DB backup and
object inventory/versions must be verified and an isolated restore exercised.
Agree RPO/RTO and freeze/cutover window. Do not use production restore as a test.

If validation fails before import, do nothing to source/target and provide specific
row/field corrections. If an import fails mid-batch, disable batch visibility,
retain checkpoints/evidence and resume or apply a reviewed compensating action.
Never delete pre-existing records because a payload included their names/IDs.

Rollback is batch-scoped: reverse only batch-created records not subsequently used,
modified or referenced, or restore approved prior revisions using optimistic checks.
If concurrent production work exists, use reviewed compensating changes rather than
restoring the entire DB to an old point. Preserve trusted audit and batch provenance.
Object deletion requires reference/version/retention checks and separate authorization;
quarantined or orphan objects should follow the approved retention process.

Source application rollback is separate from data rollback. Verify a compatible
source build and schema first; restoring source alone does not restore local data,
PostgreSQL or originals. Leave D:\vetthevat-backup unchanged. A saved browser snapshot
can be restored only through a future reviewed recovery tool into an isolated
profile first; no blind localStorage overwrite or automatic reset.

User communication before import must state which companies/records/files are being
copied, who can access them, ambiguous/rejected rows, missing original limits and
retention. Completion reports counts/mappings/financial totals/failed items and a
downloadable recovery receipt. Failed/partial imports retain source and tell users
what remains local and how to retry/contact the real approved support channel.

## Future acceptance tests and approvals

All synthetic tests run first in an isolated staging PostgreSQL/storage environment:

- Legacy Stage 1 minimal and Stage 2/3 full shapes; missing optional fields, empty
  collections, non-UUID/duplicate scoped supplier IDs and unknown field preservation.
- Dry-run changes no business rows or objects; authenticated ownership mapping;
  forged role/company/actor/import IDs denied; no imported active privileges.
- Mixed currencies/rates, zero/missing/exempt ambiguity, fractional prices/discounts,
  repeated lines, source/line/header conflicts, strict invalid dates and precision.
- Same batch twice, concurrent conflicting import/edit, NULL supplier duplicate,
  malformed/oversized JSON, foreign child references and changed approval snapshot.
- Missing legacy originals, no-checksum ambiguity, same-name checksum mismatch,
  quarantine failures, crash/retry/orphans and authorized retrieval after refresh.
- Exact source/target counts/totals, original hashes and reports/exports; batch
  rollback without deleting existing or subsequently edited data; isolated restore.
- Verified owner/recipient identity needed for separate invitations; subscription
  UI and local payment labels never activate paid entitlements or settlements.

Required approval: ownership mapping and legacy/demo retention policy, allowed
financial exception handling, original-file retention/import limits, staged recovery
evidence, exact batch dry-run and execution target. Provider/package/migration/live
access approvals are independent. This Stage 4 plan authorizes none of those actions.

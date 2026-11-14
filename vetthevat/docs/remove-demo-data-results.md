# Remove seeded demo data

20 October 2026. Local application changes only; no deployment, database/Firebase
access, package installation or modification of D:\vetthevat-backup.

## Behaviour

- Fresh workspaces start without sample companies, invoices, documents, suppliers,
  team members, support tickets, notifications or activity.
- Empty workspaces show company setup, then the existing VAT application. The first
  company is selected and stored locally. Empty persisted workspaces reload safely.
- On reload, existing workspaces remove only unchanged records matching the legacy
  sample fingerprints. Edited records and dependencies of user-created/edited
  records, bank records and company settings are preserved conservatively.
- Cleanup first saves the original raw workspace under the private browser-local key
  `vet-the-vat-before-demo-cleanup-v1`. A backup failure stops cleanup without
  overwriting the workspace. No customer records are uploaded, printed or exported.
- That recovery copy remains in the same browser and is not an encrypted, off-device
  or durable backup. It is intentionally not erased automatically.
- The public desktop/mobile illustrations contain empty states rather than invented
  companies, invoice rows or financial figures. Their invoice link is functional.
- New extraction activity identifies a local workspace user, without fabricating an
  authenticated Demo User. Existing financial calculations and OCR logic are preserved.

Legacy fixture definitions remain only for safe matching/removal and tests; they are
not supplied as application initial data. Local-storage and unavailable-integration
notices remain honest. Edited or referenced sample records may remain to avoid
losing real work attached to them; this is not a blanket browser reset.

## Verification

- 69 automated tests passed, including empty reload, sample cleanup, preservation of
  user/edited/linked records and bank ownership, idempotent cleanup, backup ordering
  and storage failure protection.
- TypeScript and production build passed.
- Fresh-profile browser check passed empty startup, real company creation and reload
  without sample invoices. Historical browser suites now create their fixtures
  explicitly inside isolated test profiles instead of depending on application seeds.
- Full browser suite passed invoice/OCR/retry/document recovery, reports/exports,
  company/supplier/team/settings, banking/reversal and responsive/keyboard journeys
  at 320/390/768/1024/1440 widths, with no uncaught page exceptions.
- `--cleanup-only` passed existing synthetic sample removal on reload and exact
  browser-local recovery-copy verification. No owner browser profile was inspected.

## Recovery

Pre-edit originals: `.recovery/remove-demo-20261020-205048` (flat filenames).
Never restore over subsequent work without reviewing the file inventory. No source
rollback, owner browser reset or recovery-copy deletion was performed.

Reload the updated local app to run the browser-local cleanup. No live hosted app
was changed, and no existing owner browser profile was accessed by the tests.

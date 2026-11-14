# Local document worker activation — 2026-10-29

## Result

The approved local Windows/WSL worker completed one labeled synthetic PDF workflow against `vtv_saas_dev`: durable private upload, matching Windows/WSL bytes, clean ClamAV inspection, completed OCR, human review, and a saved draft invoice. PostgreSQL remains restricted to the approved development interfaces. No schema, production resource, firewall, or listener setting was changed during the storage fix.

## Architecture and guardrails

- The existing worker entry point is `workers/main.ts`, with the isolated scanner/OCR service in `workers/processing.ts`.
- `scripts/local-document-workers.cjs` starts the processor and existing `inspect` and `extract` jobs. It validates the local profile, exact database name/port, existing least-privilege role, private approved host, and installation identity. It does not migrate or seed the queue.
- The local profile is `local-wsl`, requires development/test mode, and is limited to the approved `vtv_saas_dev` installation. Staging/production profiles and Vercel are rejected.
- The processor has no database or provider credentials. It accepts requests only on `/run/user/<uid>/vtv-document-worker/processing.sock`; the socket directory is private to the WSL user. ClamAV is reached only through `/run/clamav/clamd.ctl`.
- Existing document quarantine, durable job claims, authenticated preview gates, tenant checks, and audit writes remain in the existing application and worker paths. No alternate upload or processing pipeline was added.

## Local configuration completed

- Added the local-only worker profile and DB identity checks in `lib/server/deployment-profile.ts`, `lib/server/saas/worker-store.ts`, and `lib/server/saas/document-runtime.ts`.
- Added the restricted WSL launcher `scripts/local-document-workers.cjs` and `npm run local:workers`.
- Worker entry points now defer unrelated native/payment/mail imports so the isolated worker can load in Linux without loading Windows native modules.
- The WSL ClamAV daemon is active. Its socket is `clamav:clamav`, mode `0660`; the WSL user is in the `clamav` group. `VERSION` freshness checks are enabled. `clamd` reported ClamAV 1.5.4 with current signature metadata during the check.
- Confirmed the existing `vtv_saas_document_worker` role is least-privilege and has the existing inspection/extraction function grants. Its credential was randomized for the approved dev database only and placed in `/home/vraj_soni/.config/vetthevat/local-worker.env` (directory `0700`, file `0600`). Secret values are intentionally omitted.
- Installed checksum-verified Node 22.15.1 for `vraj_soni` and the lockfile-pinned Linux esbuild package under the WSL home directory.
- The legacy `.local-private-originals` directory remains in the workspace and its contents were not moved or deleted. New local storage now defaults to an OS user-data directory outside the workspace; use the explicit copy command below before switching an existing installation so previously stored originals remain available.
- No database migration ran. The labeled test created its disposable test identity/company, document, extraction/inspection records, supplier contact, and draft invoice. The 85 preexisting queued inspection jobs were locked during processing, verified unchanged, and left queued; exhausted jobs were not retried.

## PostgreSQL connectivity

The approved cluster is `D:\vetthevat.saas-dev\cluster`; the separate Windows PostgreSQL service was not touched. The earlier narrow WSL development connectivity approval has been applied and WSL connectivity is working. This task did not change database listener or firewall settings. PostgreSQL access remains restricted to the approved WSL development network and is not exposed to the public internet.

The existing `scripts/enable-local-wsl-postgres-firewall.ps1` remains the narrowly scoped approved procedure. Do not broaden its source subnet, listener addresses, database, or worker role.

## Component test evidence

The latest focused private-storage, worker-profile, and deployment-hardening run passed all 11 tests. TypeScript and worker builds passed during the implementation. The browser test wrapper initially exposed missing local-storage activation in the direct SaaS startup, then uncovered WSL argument quoting and stale assertions against the extraction/inspection response shapes. Those wrapper defects were corrected. The single uploaded PDF was not uploaded again; its remaining review/save steps were verified against that same document through authenticated application APIs and database queries.

The actual WSL worker supervisor claimed the labeled inspection and extraction jobs. ClamAV recorded a clean verdict (`ClamAV 1.5.4/28169`, policy `vtv-local-bounded-v1`); extraction completed with human review required. The reviewer corrected an OCR `0`/`O` ambiguity against the original PDF before saving the attached invoice draft. No R2 migration or unrelated lifecycle operation was performed.

## Private local storage

The provider-neutral `PrivateOriginalStore` interface selects the local filesystem by default only for the approved development/test profile. The default directory is `%LOCALAPPDATA%\VetTheVat\private-originals` on Windows and `$XDG_DATA_HOME/VetTheVat/private-originals` (or `~/.local/share/VetTheVat/private-originals`) on Linux. Set `SAAS_LOCAL_ORIGINALS_DIR` to an absolute, private location outside the application workspace when the Windows app and WSL workers need the same files. Keep the Windows directory ACL limited to the current user, SYSTEM, and Administrators; on Linux, keep the directory user-owned and mode `0700`.

To preserve files in the previous workspace directory, first stop local app/worker processes, then copy and verify without removing the originals:

```powershell
$storage = Join-Path $env:LOCALAPPDATA 'VetTheVat\private-originals'
npm run documents:copy-local -- $storage
```

Set `SAAS_LOCAL_ORIGINALS_DIR` to that absolute Windows path in the local app environment. In WSL, configure the same directory using its mounted path, for example:

```bash
export SAAS_LOCAL_ORIGINALS_DIR="$(wslpath -u 'C:\Users\<your-user>\AppData\Local\VetTheVat\private-originals')"
```

The local SaaS server pins storage to `%LOCALAPPDATA%\VetTheVat\private-originals`, explicitly enables the approved development-only adapter, and rebuilds before startup if its Next.js output is stale. The WSL worker launcher fails closed unless `SAAS_LOCAL_ORIGINALS_DIR` is explicitly set to the mounted LocalAppData path; keep that export in the protected worker environment file so the app and worker cannot silently fall back to different directories.

The copy is idempotent, checksum-verified, rejects symlinks/unexpected filenames and never deletes the legacy source. Do not point storage at `public/`, `.next/`, or any source-controlled directory. The store uses random document IDs, hash-derived opaque filenames, write-once atomic creation, integrity checks, and removes only stale, precisely named temporary upload files.

## Backup and restore

Pause uploads and document workers before taking a consistent local snapshot. Copy the entire private storage directory to an access-controlled backup location on a separate disk; do not use a mirroring option that deletes destination files:

```powershell
robocopy $storage $backup /E /COPY:DAT /DCOPY:DAT /R:2 /W:2 /XJ
```

Record and compare SHA-256 checksums for every `.original` file at source and backup. Back up the associated `vtv_saas_dev` metadata separately with an approved, read-only database backup process (for example, a password-prompted `pg_dump --format=custom` archive); store the archive and checksum beside the file backup, not in the application workspace. Restore files to the same configured private directory and compare the checksum inventory before restarting services. Restore database metadata only into a separately approved isolated database target; never restore over a running/protected database without explicit approval. Keep the file and database snapshots from the same paused-worker window.

## R2 migration

`npm run documents:migrate-r2 -- --dry-run` is the required first step. It reads the approved local database inventory in a read-only transaction, verifies local file checksums and the private R2 bucket configuration, and prints a plan hash. After reviewing that output and supplying approved R2 credentials, rerun with `--apply <plan-hash>`. The command copies immutable keys, verifies every SHA-256 and exact object count, resumes safely by re-verifying objects already copied, does not alter database metadata, does not switch reads, and never deletes local originals. Only enable `R2_ENABLED=1` after an apply result reports `cutoverReady: true`.

For rollback after R2 has received new uploads, first run `npm run documents:migrate-r2 -- --restore-local --dry-run`, then `--restore-local --apply <plan-hash>`. It verifies the current R2/database inventory and restores the missing immutable files to the configured local directory without deleting R2 objects. Switch reads back to local only after `rollbackReady: true`; retain the local directory and its backup throughout.

## Commands after the scoped PostgreSQL path is enabled

From WSL, in the repository mount, rebuild the Linux worker bundles and start the existing supervisor:

```bash
export PATH="$HOME/.local/bin:$PATH"
cd /mnt/d/vetthevat
NODE_PATH="$HOME/.local/share/vtv-linux-tools/node_modules" npm run workers:build
set -a
source "$HOME/.config/vetthevat/local-worker.env"
set +a
npm run local:workers
```

The supervisor starts the protected processor and the existing `inspect` and `extract` workers. Stop it with Ctrl-C. Do not run migrations. The application-side upload and authenticated preview must then be verified in the browser against a new synthetic invoice before declaring the worker active.

## Acceptance status

| Check | Result |
|---|---|
| Existing worker architecture/profile reviewed | PASS |
| Local profile restricts DB target and worker role | PASS |
| WSL Node/build and protected ClamAV socket | PASS |
| Synthetic PDF/image scan and OCR via processor socket | PASS |
| Malformed document remains blocked | PASS |
| PostgreSQL connection from WSL | PASS — approved development network only |
| Labeled application upload and durable private original | PASS — LocalAppData object exists and Windows/WSL SHA-256 matches |
| Inspection job and ClamAV verdict persisted in PostgreSQL | PASS — clean, ClamAV 1.5.4/28169 |
| OCR extraction job | PASS — completed; review-required data persisted |
| Human correction and invoice draft with document attachment | PASS — synthetic invoice saved as draft |
| Browser E2E wrapper rerun after its harness fixes | NOT RUN — would create a second labeled upload; existing upload completed and was verified separately |
| Preexisting queued jobs | PASS — all 85 remained queued with state/attempts unchanged |
| Migrations / production changes | NONE |

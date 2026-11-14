# Local Linux document-worker audit and setup — 2026-10-29

Project: `D:\vetthevat`
Approved database: `127.0.0.1:55440/vtv_saas_dev`
Chosen Linux path: **WSL 2 with Ubuntu 24.04 LTS**, pending administrator installation. Docker is not selected, so there is only one planned processing pipeline.

## Audit results

| Component | Result |
| --- | --- |
| Windows | Reports Windows 10 Home Single Language; WSL reports “not installed”. Windows WSL installation must be done from an elevated PowerShell and may require a reboot. Hardware virtualization could not be inspected because Windows denied the processor query; verify it is enabled in BIOS/UEFI before installing WSL 2. |
| Docker Desktop / Linux containers | Docker CLI/Desktop not found. Not required for the chosen WSL approach. |
| PostgreSQL | TCP at `127.0.0.1:55440` reachable. `npm run local:check` verified the approved dev DB identity and business, ORS, routing, trial, team and support schemas. |
| ClamAV / freshclam | Not installed on Windows. |
| Poppler (`pdfinfo`, `pdftoppm`) | Not installed on Windows. |
| ImageMagick (`identify`, `convert`) | Not installed on Windows. `convert.exe` resolves to the Windows system utility and is not ImageMagick. |
| Tesseract | Windows Tesseract and English trained data are installed, but this is not a trusted inspection runtime and does not promote quarantined files. |
| Existing worker role | The read-only PostgreSQL check found `vtv_saas_document_worker`, with LOGIN and without superuser, BYPASSRLS, create-role/database, replication, database CREATE/TEMP, or role memberships. It has EXECUTE on `business.claim_inspection()`, `business.claim_extraction()`, `business.finish_inspection(...)`, and `business.finish_extraction(...)`. |
| Dedicated local worker credential | Not present in the local runtime configuration. No password value was read or printed. The existing role cannot be used without a separately provisioned credential. |
| Existing worker runtime | `npm run workers:build` passes. The actual service requires a managed `staging` or `production` profile; processor and scanner sockets are also restricted to those profiles. `npm run local:workers` fails closed and reports that no job was claimed. The current local web runtime cannot reach the Linux Unix socket because it runs on Windows. |
| Application listeners | Node listeners were visible on 3000, 3444, and 8025, but command-line inspection was denied. They were left running. The local launcher refuses because 3000 is occupied; current HTTPS browser behavior could not be verified. |

No operating-system packages or Windows features were installed. No migration, role change, password change, database write, production connection, or VPS action occurred.

## WSL installation — administrator action required

Microsoft’s supported install command installs WSL and Ubuntu. Open **PowerShell as Administrator** and run:

```powershell
wsl --install --distribution Ubuntu-24.04
```

Restart Windows when prompted. Launch Ubuntu from the Start menu and create its Linux username/password. Then verify from PowerShell:

```powershell
wsl --status
wsl --list --verbose
```

Ubuntu must show WSL version `2`. If needed, run:

```powershell
wsl --set-version Ubuntu-24.04 2
```

If the command says virtualization is unavailable, enable CPU virtualization in BIOS/UEFI and confirm the Windows Virtual Machine Platform feature is enabled. Microsoft documents `wsl --install` for supported Windows 10 (version 2004/build 19041+) and Windows 11, and says the install process may require restarting. See [Microsoft’s WSL installation guide](https://learn.microsoft.com/windows/wsl/install).

## Ubuntu dependencies — run after WSL exists

These commands install the packages required by the existing processor. They are provided for the user to run inside Ubuntu; they were not run here:

```bash
sudo apt-get update
sudo apt-get install -y clamav clamav-daemon poppler-utils imagemagick tesseract-ocr tesseract-ocr-eng
sudo freshclam
```

Check the resulting tool versions before configuring any service:

```bash
clamscan --version
freshclam --version
pdfinfo -v
pdftoppm -v
identify -version
tesseract --version
tesseract --list-langs
```

Do not expose ClamAV’s TCP port. The intended design uses a permissioned Unix socket, current signatures, the supplied ImageMagick policy, no network from the decoder, bounded page/pixel/memory/time, and non-root service identities. Existing templates under `deploy/processing` and `deploy/systemd` are for managed `staging`/`production` profiles and are **not** a local WSL configuration.

## Required local implementation gates before starting a worker

Installing Ubuntu packages is insufficient by itself. The following work is still required and must be tested before enabling a local queue consumer:

1. Add a fail-closed **local-only worker profile** that accepts only this approved dev installation/database and cannot be selected in staging/production. Give it separate socket/heartbeat paths and retain non-root, secret-free processing isolation.
2. Run the application process that sends/receives the inspection request inside the same WSL distribution as the Unix sockets. Do not bridge the scanner through a public or unauthenticated TCP port.
3. Provision a dedicated random credential for the existing `vtv_saas_document_worker` role through the protected local operator procedure; never reuse the web/runtime/operator password. Store it outside the repo with restrictive permissions. No credential exists in the current runtime config.
4. Configure local private document storage and the correct business installation ID in WSL without exposing secrets to the decoder process.
5. Start ClamAV only with the approved local socket, install fresh signatures, verify signature age and enforce the supplied decoder policy.
6. Run the worker integration fixtures on WSL: clean synthetic PDF and images, infected EICAR fixture, corrupt/encrypted/oversized inputs, multi-page decoding, real OCR text comparison, timeout/restart/retry, quarantine state, authorized clean preview, tenant denial and PostgreSQL side-effect reconciliation.

The code currently refuses steps 1–4; do not copy production env files or production service templates into WSL as a workaround. No local worker launch command can truthfully be given until those local-only runtime changes and tests exist. The deployment runbook remains the managed-host runbook, not a local WSL worker launcher.

## Current feature acceptance

| Feature | Result |
| --- | --- |
| Build, typecheck, automated tests | **PASS** in the prior readiness run: build and typecheck succeeded; 310 tests passed. `npm run workers:build` also passed in this audit. |
| Registration, verification, onboarding, automatic trial | **PASS in prior local acceptance**; not re-run because the current browser listener owner is unknown. |
| VAT/ORS navigation, Both purpose routing, same canonical document, no auto-financial side effects | **PASS in prior local browser/PostgreSQL evidence** for routing lists only. The lists are not independent VAT and ORS state machines. |
| Secure upload/quarantine and tenant authorization | **PASS in the existing application/API design and prior local acceptance**; new clean verdict and preview cannot be exercised without the worker. |
| Clean scan, OCR extraction, review and authenticated clean preview | **BLOCKED** until the WSL and local worker gates above are implemented and passed. |
| Independent VAT and ORS review/approval for Both | **BLOCKED**; the current schema stores routing purpose, not separate per-module review states. This needs a separately reviewed schema change and explicit approval before execution. |
| Android Chrome and iPhone Safari camera capture | **BLOCKED**; no physical-device test was performed. |
| Current real browser refresh, cross-tenant and end-to-end financial reconciliation | **BLOCKED** in this run because the local listener command could not be inspected and the HTTPS request did not reach an HTTP response. Existing prior evidence does not replace a fresh acceptance run. |

## No migration has been prepared or run

Separate per-module review states for Both processing are absent from the current schema, so implementing that requirement will require a schema design. No migration has been created or executed. The user’s approval gate also requires a verified fresh backup and a disposable restore rehearsal, while current instructions limit database use to the approved development database and prohibit touching protected test databases. Resolve an explicitly authorized disposable restore target before preparing an executable migration review package.

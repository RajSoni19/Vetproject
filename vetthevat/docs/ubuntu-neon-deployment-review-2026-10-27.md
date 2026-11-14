# Ubuntu / Cloudflare / Neon delivery review — 27 October 2026

**Staging: NO-GO. Production: NO-GO. Preparation only; nothing deployed.**

The current application and release evidence is in the [27 October staging checkpoint](final-staging-checkpoint-2026-10-27.md). This supplement records the earlier deployment-package review, selected infrastructure and verification limits. It does not promote local acceptance into managed-provider acceptance.

## Delivered package

| Deliverable | Reviewable files |
| --- | --- |
| Architecture, directory structure, exact starting resource allocations and required private credentials | [Architecture](../deploy/architecture.md), [Neon contract](../deploy/neon.md), [runtime manifest](../deploy/runtime.json) |
| Actual application, worker, connection, job and migration audit | [Audit](../deploy/audit.md), offline `.deployment-review/migration-inventory.json` |
| Ubuntu accounts, verified dedicated Node installation, versioned releases and rollback | [Ubuntu scripts](../deploy/ubuntu), [runbook and future commands](../deploy/runbook.md) |
| Independent web/mail/Stripe/document/processing/ClamAV services | [Systemd units](../deploy/systemd), [worker entrypoints](../workers) |
| Nginx, Full (strict) TLS and origin-pull client authentication | [Nginx templates](../deploy/nginx), [TLS instructions](../deploy/runbook.md) |
| Disabled staging and production environment templates | [Staging](../deploy/environments/staging), [production](../deploy/environments/production) |
| Database runtime/migrator separation and RLS requirements | [Neon contract](../deploy/neon.md), [role design template, not approved SQL](../deploy/postgres/roles.sql.template) |
| Private R2, SMTP/Nodemailer and Stripe test-provider requirements | [Provider runbook](../deploy/providers.md), [operations](../deploy/operations.md) |
| Isolated document decoding/ClamAV/OCR | [Processing entrypoint](../workers/processing.ts), [bounded policy/config](../deploy/processing) |
| Secret rotation, monitoring, backup and fresh-target restore | [Operations](../deploy/operations.md), [backup](../deploy/ubuntu/backup.sh), [restore drill](../deploy/ubuntu/restore-drill.sh) |
| Clean Linux build and isolated release verification, without deployment | [CI workflow](../.github/workflows/deployment-package.yml), [Linux acceptance script](../deploy/ci/linux-acceptance.sh) |

Targets are Neon AWS London (`aws-eu-west-2`), `staging.vetthevat.com`, `app.vetthevat.com`, Ubuntu 24.04 AMD64 and Node 22.23.4 Linux x64. Use independent Neon projects/databases, credentials, installation identities and backups. The exact direct endpoint names, project/branch IDs, CA trust snapshot and purchased recovery/availability settings remain inputs. No private value belongs in chat or a release artifact.

Starting reservations: web staging 2 vCPU / 4 GiB / 40 GiB free SSD; web production 4 vCPU / 8 GiB / 80 GiB free SSD; separate processing host per environment 4 vCPU / 16 GiB / 40 GiB staging or 80 GiB production SSD; Neon initial 2 CU each, with 20/50 GiB storage budgets; clean Linux CI 4 vCPU / 8 GiB / 20 GiB. Existing websites' allocations are excluded. If both web environments share the existing VPS, reserve their combined 6 vCPU / 12 GiB / 120 GiB **in addition to** current workloads and OS headroom, then load-test. These are planning requirements, not measured minimum capacity or proof the current VPS can support them.

## Changes completed in this review

- Required explicit Neon London direct-endpoint selection, exact approved database/origin/install identity and environment-specific CA paths; no fallback to development configuration.
- Verified the actual authorized TLS socket and peer hostname on pinned managed connections for auth, business, provider ingress, Stripe reconciliation, document jobs and readiness. SQL role/installation checks remain on the same connection. Backend `pg_stat_ssl` is diagnostic rather than client TLS proof.
- Refused development filesystem and loopback S3 originals whenever a managed or invalid deployment profile is selected.
- Rejected malformed, stale, excessively future-dated, wrong-release and unknown-state worker heartbeats.
- Pinned Linux x64 Node 22.23.4 for release compilation, activation and rollback. Added signed-official-tarball installation tooling and separate writable caches per release.
- Prepared isolated CI against the actual rendered Nginx vhost with disposable local CA/client certificates, private-route denial and native worker dependency loading. This fixture remains unexecuted on Linux.
- Preserved approved migration files and local runners; no SQL was executed and no environment flag/provider was enabled.

## Verification actually obtained

The final local suite passed **284 tests, zero failures**, including existing ORS and banking tests. TypeScript, the Windows Next production build, independent worker compilation, Git Bash syntax checks and Python compilation passed. Offline renders exist at `.deployment-review/neon-staging` and `.deployment-review/neon-production`; no credentials are embedded. All inventoried approved migration hashes through 021 still match. A scan of 63 browser assets found zero exact matches for the one configured sensitive value checked and the private-key marker; that limited scan is not a complete secrets/log audit.

This machine has no usable Linux/WSL/Docker/Nginx/systemd environment. No Linux release was built, no CI workflow was dispatched, no managed RLS or non-root systemd acceptance was executed, and no managed/provider backup, restore or crash-recovery acceptance occurred. Prior browser/database evidence is retained as historical local evidence; this review ran no database migration or integration fixture mutation.

This workspace has no usable Git repository metadata (`git status` reports that it is not a repository), so no commit, PR or repository diff was produced. Approved SQL integrity was checked against the existing checksum manifests. Final CI must use a reviewed source snapshot in a real repository with provenance.

## Remaining blockers and next review

1. Obtain exact Neon environment identities/endpoints and provider constraints; render fresh provider-specific bootstrap/role files. Each executable migration then needs exact filename, SHA-256, target, backup and rollback review plus separate approval. Existing local migration approvals do not authorize Neon execution. No new executable migration is currently ready for approval.
2. Run the clean Linux package workflow, non-root service/sandbox tests, actual rendered Nginx TLS tests and failed-release rollback drill in a disposable environment. Review immutable input provenance and native dependencies; the current Windows build cannot be deployed.
3. Privately configure approved isolated R2, fresh ClamAV signatures, bounded native decoder/OCR and a durable worker host. Execute actual upload → clean scan → OCR review → confirmed invoice → authorized original retrieval; demonstrate corrupt/infected/bomb/timeout denial and expired-lease recovery.
4. Supply isolated Stripe test credentials/prices/API version/webhook configuration and controlled SMTP sink credentials. Execute actual hosted Checkout/Portal and signed webhook lifecycle tests, email TLS/downstream acceptance and uncertain-acknowledgement drills. Production billing/customer mail remain disabled.
5. Complete managed public contact/Turnstile and its missing notification claim/acknowledgement schema/worker; implement server-backed support/admin/POS/detail/report workflows and complete downgrade/excess company/seat/history enforcement. Their existing local/front-end representations are not accepted server functionality. New schema authority requires separate migration review; these features were not completed by this infrastructure package.
6. Execute approved fresh-target Neon restore/PITR and original-object recovery, worker crash/restart/retry tests, real alerts, backup retention and capacity/soak checks. Install no timer or scheduler until manual recovery acceptance passes.

No VPS connection, SSH installation, Nginx reload, Cloudflare/DNS change, customer email, payment, Firebase/Flutter/Vercel change, protected-cluster access or immutable-backup mutation was performed. Full acceptance status is tracked in [the deployment ledger](../deploy/acceptance.md).

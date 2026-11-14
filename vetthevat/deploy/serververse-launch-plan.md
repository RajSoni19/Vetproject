# VET THE VAT — ServerVerse launch plan (7 November 2026)

**NO-GO for public production. Local implementation and rehearsals only.** No SSH, VPS package/account/database creation, service restart, Nginx/DNS change, production SQL or public enablement has been performed. Inovetaa and every existing VPS application remain excluded.

## Prepared implementation

Reuse the existing guarded release, rollback, systemd, Nginx, processing and backup package. Production selects the existing `serververse` PostgreSQL profile: PostgreSQL 17, `vtv_saas_production`, TLS-verified `127.0.0.1` on a separately audited unused port. Runtime roles remain distinct, non-superuser, NOBYPASSRLS and without owner memberships. No public PostgreSQL listener or development-database fallback is accepted. Web auth/business pools remain bounded at three each; document workers use one connection each. The template's 48 PostgreSQL connections leave headroom only after the actual process/worker count is verified.

Changes prepared during this sprint:

- A dedicated PostgreSQL systemd template, bounded PostgreSQL config and dedicated administrator peer map. There is no automatic `initdb`, schema bootstrap, role creation or migration on startup. Bootstrap refuses existing originals/PostgreSQL paths before provisioning identities.
- An optional ServerVerse private-files adapter reusing the existing immutable, digest-checked, atomic local byte store. It is disabled until an installation-specific approval, exact external path, Linux UID/GID and mode checks pass. It cannot coexist with an enabled R2/S3 adapter.
- Originals at `/var/lib/vetthevat-production-originals`: owner is the dedicated web UID, group is `vtv-originals-production`, directory mode 2750, published files 0640. Inspect/extract/backup identities have group-read access; document workers cannot write through the adapter or directory permissions. No static/public invoice URL exists. Company authorization and clean-original checks still run through the existing backend before reads. These POSIX ownership settings have not been applied to a VPS.
- ServerVerse OCR workers require an explicit database-matched activation timestamp and use the scoped claim functions. Existing local workers validate the exact Migration 037 fence `2026-10-30T16:50:33.492Z`; no fence is reset or old job requeued.
- Two reviewed Nginx rendering modes: the existing Cloudflare mTLS default, and an explicitly selected verified-origin-TLS variant. AOP is a separate Cloudflare setting and is not assumed merely because strict origin TLS is used. Neither mode changes DNS, existing virtual hosts or global service settings. Custom internal app ports can be rendered after audit; 3200 remains an unverified proposal.
- File backup archives validate regular immutable objects, hashes, inventory and safe member names. File recovery refuses links, traversal, tampering and existing targets. The database snapshot precedes the immutable file inventory, so every committed DB original reference must already have published bytes. Age encryption precedes off-host upload; archive and checksum are both copied and download-compared. External originals instead require separate recovery-evidence attestation. No remote backup has been performed.
- A read-only structured monitoring probe and inactive timer check private app/DB/storage readiness, disk, worker heartbeats, scanner availability/signature freshness, offsite backup freshness and restore-test age. There is no installed alert destination or delivery claim. The VTV-only probe reads private health metadata under a constrained one-shot service; it receives no database or invoice credential.
- An offline capacity gate requires a fresh verified host audit, VTV-exclusive spare resources and unused ports. The current worst-case budgets total 14,464 MiB, four available vCPUs and at least 30 GiB free disk, with database/original growth added. These are conservative preparation budgets, not measurements or throughput guarantees. Malware scanning is never disabled to fit.

## Clean production bootstrap and migration review

`scripts/deployment/prepare-serververse.cjs` creates an offline review package with exact source hashes, dependency decisions, conditional Nginx variants and a failing-until-audited capacity record. Every migration remains `approved:false`, `productionCompatible:false` until separately reviewed production target guards and an isolated production-shaped rehearsal exist. Nothing connects or applies SQL.

The production database must be **new and empty**. Provision the database owner, NOLOGIN function/schema owners, migrator, independent runtimes, backup-only role and isolated recovery identity using reviewed VTV-only SQL. Refuse pre-existing schemas, roles or application data. A role name shared with another database/application is a stop condition. Do not run both the role template and Migration 001's original role-creation statements: the production baseline must split that lifecycle explicitly. Do not import a development archive or copy users, companies, invoices, originals, sessions, jobs or provider data into production.

Review the complete source inventory in dependency order, including web-auth 030 and both different 036 files. Use the corrected 003/006/028 definitions rather than creating the superseded schemas twice. Target guards containing the Windows directory, development database/operator/port or installation UUID must be individually rebased and hashed for the audited production target; a broad text replacement is not an approved migration strategy. Seed only reviewed static permission/role metadata and newly generated installation IDs. Preserve forced RLS, exact function ownership/search_path, revoked PUBLIC EXECUTE and immutable history.

Migration 041's disposable rehearsal is now successful **when paired with the separate 042 correction**. Migration 041 alone reproduced the forced-RLS selection-row-lock failure. The corrected disposable rehearsal passed source ACL replication, catalog-verified constraints, VAT/ORS initialization, replay idempotency, viewer/cross-company denial, append-only audit and purpose-history preservation. The source schema/data/ACL snapshot was unchanged by the rehearsal and the disposable database was dropped.

Live development approvals remain pending:

- `041_invoice_module_review_initializer.review.sql`: `7d0a8ce7714f0c053ff8a25bc5be04b825988765a33992ac24be7bf7f06bdc9f`
- `042_module_review_initializer_selection_rls.review.sql`: `2deb1b5f1174c63e285e43615c795eb866e7febf7ef12b607bd340194e72f669`
- ORS supplier invoice review persistence also remains gated by the unapplied `036_ors_supplier_invoice_lines.review.sql`: `c6e177cf5a18fe8a2856d1ac0d3450ccc8d00addc32355eb50a9a535453d5ba9`.

No live migration was executed. Existing SQL files, an installed table or a passing disposable test do not constitute production approval. The complete production-rebased baseline and non-superuser recovery grants/COPY-under-RLS acceptance are still launch blockers.

## Exact proposed VPS changes — conditional, not authorized

After the verified read-only audit and explicit change approval:

1. Record existing Inovetaa/other-site health, listeners, service identities and Nginx/TLS baselines. Select VTV-exclusive paths and unused app/PostgreSQL ports. Reject collisions; never stop an unrelated process to free a port.
2. Create only new `vtv-*-production` nologin service identities/groups and VTV directories under `/srv/vetthevat/production`, `/etc/vetthevat/production` and `/var/lib/vetthevat-production-*`. The separate audit account is covered by `serververse-access.md` and has no sudo or application access.
3. If absent, separately approve only the required PostgreSQL 17, native scanner/OCR and pinned Node runtime installation. Simulate package changes first; do not upgrade shared Node/PM2, replace PostgreSQL clusters, overwrite global Nginx settings or alter existing scanner/update services. The isolated PostgreSQL data directory must be new; initialization is an explicit DBA action, never a service pre-start command.
4. Review and provision the dedicated TLS-only loopback database, exact role/database grants, new installation IDs and clean baseline. Install private CA/server certificates with SAN `127.0.0.1` for verify-full loopback connections. PostgreSQL's private key belongs only to its service identity. No public port/firewall opening is proposed for PostgreSQL or Node.
5. Build and verify a clean Linux x64 release on the exact pinned Node 22.23.4 runtime, outside this Windows dependency tree. The local WSL runtime is 22.15.1; a Windows production build is not a deployable Linux-native artifact. Verify checksums, native modules and absence of secrets before transfer.
6. Install root-owned versioned VTV releases and private 0600 configuration files. Configure one approved private originals backend and independent encrypted offsite recovery. Approve SMTP sender/delivery and any required payment-provider acceptance separately. Keep feature flags/worker gates disabled until their schema and service acceptance pass.
7. Install only VTV-named systemd units. Processor remains secret-free, native scanning stays mandatory, and the production queue fence is explicitly reviewed. Verify real scanner signatures, sandbox limits, OCR, leases and private original recovery before starting any consumer. Start/restart only VTV services after explicit approval.
8. Add only a VTV-named Nginx site plus its narrowly named log/proxy definitions. Confirm origin TLS/AOP topology from audit, run actual `nginx -t`, and baseline/recheck every existing website around the separately approved reload. Never replace the default site or change unrelated caching, certificates or access rules.
9. Run private two-tenant invoice/upload/OCR/cart/WhatsApp-draft, SMTP, recovery, monitoring and restart tests on the deployed VTV build. Review the exact artifact-hash acceptance record; all existing flags stay false until evidence is approved.
10. Only after another explicit approval enable DNS/proxy/public access for `vetthevat.com`. No such action is included in local preparation.

## Backup and rollback readiness

The existing application release/rollback scripts remain application-only, switch versioned VTV symlinks and restart only VTV units. The new explicit `all` role handles web and workers on this one VPS in a single activation and health-checks both; it avoids the previous separate-host assumption and a second extraction into the same release directory. It stops VTV consumers before restarting their processor and web app, then restarts consumers. Scripts do not migrate, restore or roll back database/files. Validate the previous release against the forward schema; incompatible schema changes require a separate reviewed forward fix or recovery plan.

The local 041 rehearsal made a fresh source-verified PostgreSQL archive, restored it into a uniquely named disposable database and verified schema/data/owners/ACLs/policies/constraints. The private-file helper passed real Linux creation, digest verification and fresh-directory recovery tests. These do **not** prove production age/offsite recovery or PITR. Age/rclone, a private destination, independent recovery keys, non-superuser recovery-role grants, original-file recovery and measured RPO/RTO remain unverified. A daily logical archive alone is not a 15-minute PITR guarantee. No retention deletion is automated.

Back up before separately approved live migrations. An in-transaction error rolls back before commit. After commit, preserve evidence and use an approved forward repair or fresh-target recovery; never restore over production or erase audit/purpose history as an application rollback.

## Required remaining gates

- Verified read-only VPS access/audit, OS/architecture and sufficient exclusive capacity; no access has been supplied or attempted.
- A reviewed, production-rebased empty bootstrap/migration package and fresh-target least-privilege restore rehearsal. Pending local 036/041/042 approval must not be bypassed.
- Exact pinned Linux artifact and actual Nginx/systemd runtime acceptance. Local Bash/Python syntax and Node safety tests are not substitutes.
- Production origin TLS/Cloudflare topology, private storage, SMTP, applicable billing acceptance and secret custody.
- Actual encrypted offsite backup, independent restore, recovery-role/forced-RLS verification, signature update ownership, worker crash/recovery acceptance and an operational alert destination.
- Exact-hash release and public-access approval after existing-site baselines remain healthy.

Reference checks: [PostgreSQL 17 backup/recovery](https://www.postgresql.org/docs/17/backup.html), [PostgreSQL 17 restore behavior](https://www.postgresql.org/docs/17/app-pgrestore.html), [Cloudflare strict TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/), [separate Authenticated Origin Pulls configuration](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/).

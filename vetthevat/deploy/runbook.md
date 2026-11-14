# Ubuntu setup, Cloudflare TLS, release and rollback runbook

**No command in this runbook has been run against the VPS.** Setup, remote connection, service installation, DNS/TLS changes, SQL execution and deployment each remain unapproved. Use a disposable Ubuntu 24.04 VM/CI runner first. Inspect the actual VPS later only after connection authorization; do not replace existing Nginx, MongoDB, PM2, sites or users.

Selected production configuration: ServerVerse with a dedicated PostgreSQL 17 instance bound to loopback; staging remains separate. Production hostname is `vetthevat.com`. Ubuntu 24.04, AMD64, Node 22.23.4, port availability, DNS, Cloudflare and TLS remain unverified host assumptions.

## 1. Offline preparation and disposable Linux verification

On the current Windows workspace:

```powershell
npm run typecheck
npm test
npm run workers:build
npm run deploy:inventory
# Use new output directories if these already exist:
node scripts/deployment/render.cjs staging staging.vetthevat.com .deployment-review/neon-staging
node scripts/deployment/render.cjs production vetthevat.com .deployment-review/serververse-production
```

These operations read source and write local files; they neither connect nor deploy. The GitHub workflow `deployment-package.yml` runs only builds/tests and uploads a review artifact. It has read-only repository permission and no SSH/deployment/provider secret. It is prepared but has not been run from this workspace. A local Windows build does not establish Linux native-binary acceptance.

In a **fresh disposable** Ubuntu 24.04 machine only, after authorization to create it:

```bash
sudo apt-get update
sudo apt-get install --yes --no-install-recommends \
  ca-certificates curl gnupg python3 openssl nginx shellcheck \
  poppler-utils tesseract-ocr tesseract-ocr-eng imagemagick \
  clamav clamav-daemon clamav-freshclam postgresql-client-17 age rclone
```

PostgreSQL 17 clients may need the provider/official PostgreSQL apt repository; do not silently use an older `pg_dump` against a newer server. Installing Nginx/ClamAV packages can start packaged services: these installation commands are for the disposable machine, **not the existing VPS**. On the existing VPS, first review installed versions and use `apt-get --simulate` to assess changes; never upgrade/restart shared services as part of this package.

Install a reviewed Node 22 patch side-by-side under `/opt/vetthevat/node`, not over the Node used by PM2. Record exact version, CPU architecture and official tarball SHA-256. Verify the signed official `SHASUMS256.txt` with reviewed Node release keys before extracting. Example verification (placeholders intentionally prevent execution):

```bash
# Download exact reviewed files into a temporary directory first.
gpg --verify SHASUMS256.txt.sig SHASUMS256.txt
sha256sum --check --ignore-missing SHASUMS256.txt
# Only after signature and selected archive hash pass, install into a NEW /opt path.
/opt/vetthevat/node/bin/node --version
```

The exact selected tarball is `node-v22.23.4-linux-x64.tar.xz`. The future `install-node.sh` accepts local tarball, signed checksum list, detached signature, independently reviewed keyring and independently approved SHA-256. It verifies signature and checksum before extracting to a new `/opt/vetthevat/node-v22.23.4-linux-x64` and creating the dedicated `node` symlink. It refuses existing runtime paths, installs no packages and starts no service. Example **only after host/setup approval**:

```bash
sudo bash deploy/ubuntu/install-node.sh /private-input/node-v22.23.4-linux-x64.tar.xz /private-input/SHASUMS256.txt /private-input/SHASUMS256.txt.sig /private-input/node-release-keys.gpg <approved-64-hex-sha> --apply
```

The exact patch and architecture are pinned in `runtime.json` and CI; activation and rollback refuse mismatches. Node tarball signatures/hashes, runner image and OS package inputs still need their release provenance recorded; a mutable Ubuntu runner label is not an immutable image digest. Rebuild on reviewed security updates. Rollback across a Node patch change also requires the matching reviewed runtime. Do not transfer Windows node_modules or reuse the VPS's unknown global Node.

## 2. Dedicated PostgreSQL 17 review

After read-only host inventory and approval, select a VTV-only PostgreSQL 17 cluster and an unused loopback port. The prepared profile accepts only `127.0.0.1`, requires verified TLS and an exact port/installation approval, and rejects the local development ports. Do not reconfigure a shared PostgreSQL cluster or expose a public listener. Produce separate database roles for each web/worker function and a backup-only identity; keep migration credentials off application services.

Prepare a **new provider-specific bootstrap migration**, using the offline inventory of all forward review SQL files currently present as evidence. Preserve RLS, fixed-search-path definer functions, immutable histories, role checks, command/idempotency keys and every separately reviewed correction. Do not remove local guards from existing files or replay them remotely. The inventory is not proof of application state and is not executable approval. The roles design template is not executable approval. Record exact target, filename, checksum, provider backup/PITR snapshot, restore target and rollback plan; obtain separate user approval for each SQL file before any connection or execution.

Application and worker secret files must never contain the migrator/provider administrator credential. Runtime role session_user must remain the exact required role; do not connect through an owner and SET ROLE in production. Provision fresh installation UUIDs and bind them in each environment's configuration. Keep all module gates off until real managed RLS/identity/transaction tests pass.

## 3. Dedicated host identities and secret files

After host setup approval, run the reviewed bootstrap **on the intended host only**:

```bash
sudo bash deploy/ubuntu/bootstrap-host.sh staging --apply
# Production is a separate explicitly approved operation, not implied by staging.
```

The script creates only VTV system users/groups/directories, installs no packages and starts/reloads no service. Review existing matching names before reuse. Web, database and job/processing services are isolated on the same VPS; actual capacity must be measured first. CA files are non-secret and traversable; env/key/acceptance files remain root-private.

Render the correct hostname configuration offline. Transfer only the reviewed Linux artifact and required configuration; never SCP `.env.local` wholesale. Populate environment-specific values privately using the templates. Use a secret manager or root editor; do not pass secret values as command arguments/history or print environment dumps.

```bash
sudo install -o root -g root -m 0600 /private-input/staging-web.env /etc/vetthevat/staging/web.env
sudo install -o root -g root -m 0644 /private-input/managed-postgres-ca.pem /etc/vetthevat/staging/postgres-ca.pem
# Worker host: install only that role's matching .env, root:root 0600.
# Processing .env contains NO database, R2, Stripe or SMTP credential.
sudo install -d -o root -g root -m 0755 /etc/vetthevat/processing-policy
sudo install -o root -g root -m 0644 deploy/processing/policy.xml /etc/vetthevat/processing-policy/policy.xml
```

All secret placeholders/default flags must remain unusable until deliberately configured. Set no customer-mail or production payment enablement. Staging SMTP acceptance must use a controlled sink/synthetic addresses first. Stripe adapter supports test mode only; production live billing is a known blocker.

## 4. Processing host preparation

Use the generated environment-specific `clamd.conf`, the supplied secret-free `processing.env.template`, separate ClamAV/processing units and per-job inspect/extract env files. Configure actual fresh official signatures via freshclam on this isolated host; clamd itself has no outbound network. Signature age >24 hours must fail inspection. Verify filesystem permissions allow only the processor group to reach the ClamAV socket and inspect/extract identities to reach processing. Web/mail/Stripe identities must be denied.

Before enabling document jobs, run actual clean synthetic PDF/PNG/JPEG/WEBP, corrupt/encrypted/oversized/decompression-bomb and EICAR tests against the isolated socket. Verify network prohibition, memory/time limits, no secrets in the processor environment, file cleanup, every accepted PDF page decoded, correct real OCR text, and failure remaining quarantined. Run the actual browser upload → clean scan → OCR review → confirmed VAT → authorized retrieval journey. The new implementation alone does not pass this gate.

## 5. Cloudflare and origin TLS — instructions only

For the **new approved hostname**, prepare an origin certificate whose SAN covers that exact host, a protected private key and an account/zone-scoped Authenticated Origin Pull configuration. Full (strict) validates the origin certificate and hostname; Origin Pull mTLS separately authenticates edge access. Never switch to Flexible or Full without validation. A Cloudflare Origin CA certificate is not generally trusted by direct browsers; test the origin with the correct CA and client certificate.

The generated Nginx vhost listens on 443, requires origin-pull client authentication, fixes Host and forwarded origin headers, emits host-only HSTS without `includeSubDomains`, disables mutation retries and proxy buffering/cache, and blocks internal worker triggers and readiness from the public edge. It creates no default server and changes no existing site. Add the small named log format in HTTP context without replacing global configuration. Do not trust arbitrary `CF-Connecting-IP` or `X-Forwarded-For`; add a reviewed current Cloudflare IP-source allowlist/firewall and mTLS before using client-IP headers for rate decisions. The initial conservative application buckets do not treat untrusted headers as identity.

Review certificate/key permissions and the full combined `nginx -T` privately because existing config may contain secrets. Validate with `nginx -t` before any approved reload. **No Nginx file is installed/reloaded by this preparation.** Existing websites need independent before/after health checks when installation is eventually approved.

Cloudflare configuration must be scoped to the new hostname: proxied DNS after origin acceptance; Full (strict); managed WAF with application-specific rate rules; no cache for `/api/*`, `/app/*`, login/register/verification/reset pages, session responses or token-bearing requests. Static `/_next/static/*` can retain content-hash caching. Avoid bot challenges on Stripe's exact webhook path; rely on verified signatures and byte limits there. Do not put browser challenges on JSON auth/webhook routes. Protect staging access without preventing signed webhook acceptance tests. No DNS, WAF, cache or certificate setting has been changed.

## 6. Build and install a versioned release

Use clean Linux CI from the exact source/lockfile, with only the tracked `.env.example` at repo root and no private env files or provider secrets:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run typecheck
node scripts/deployment/build-release.cjs release-20261026-review1
```

The builder runs Next standalone and worker compilation, packages Linux dependencies/public/static assets, records release/lock hashes and all file checksums, then emits a tarball plus SHA-256. It refuses Windows builds and credential-bearing environment files. Obtain the tarball checksum through the trusted CI artifact/approval channel; a checksum downloaded beside a compromised archive is not sufficient provenance. Keep at least three last-known-good signed/approved releases, subject to measured disk budgets.

The supplied release script verifies archive paths, forbids symlinks/secret files, checks every content hash, root-owns the release, creates a dedicated writable web cache symlink and atomically changes `current`. It never runs SQL or modifies Nginx/DNS. It refuses activation without a root-owned 0600 acceptance record for that exact archive and all required evidence. Do not change false gates to true just to bypass a failed test.

After **separate deployment approval** and completed acceptance, the future command shape is:

```bash
# These are NOT authorized now. Final hostname/cert/schema/provider gates must pass first.
sudo bash deploy/ubuntu/release.sh staging release-20261026-review1 /private-artifacts/release.tar.gz <reviewed-64-hex-sha> --apply web
# Worker host, independently approved/staged:
sudo bash deploy/ubuntu/release.sh staging release-20261026-review1 /private-artifacts/release.tar.gz <same-reviewed-sha> --apply workers
```

Systemd units must first be installed under their unique VTV names, with environment files and dependencies verified. First release activation is intentionally blocked until the disposable-host acceptance is complete; use that isolated environment to perform setup rather than bypass the approval record. The web node starts only web; worker node restarts processing and the four independent jobs. ClamAV/signature management is separate. A worker in disabled/error state cannot pass heartbeat smoke tests. No automatic production activation is provided by CI.

## 7. Rollback

Application and schema compatibility must be reviewed before release; there is no automatic down migration. Changing `current` cannot undo financial/provider events. The release script attempts the previous app/worker pointer on failed post-start health, without touching database/storage. Check the rolled-back services again and record evidence.

Future explicit command after approval:

```bash
sudo bash deploy/ubuntu/rollback.sh staging --apply web
sudo bash deploy/ubuntu/rollback.sh staging --apply workers
```

Do not remove old directories, delete bucket objects, reset queues or restore a database as an application rollback. Recovery of data uses a separately approved fresh target and the procedure in `operations.md`. Root-owned release/lock pointers and an acceptance record are operational controls; independent measured acceptance and operator approval remain required.

## Primary references

- [Installed Next self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting), with the repository's installed 16.4.2 guides read before changes.
- [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/) and [Authenticated Origin Pulls](https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/).
- [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [node-postgres TLS](https://node-postgres.com/features/ssl), [PostgreSQL certificate verification](https://www.postgresql.org/docs/17/libpq-ssl.html).

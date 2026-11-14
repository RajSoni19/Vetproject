# Ubuntu / Cloudflare / managed PostgreSQL deployment package

**Staging: NO-GO. Production: NO-GO. Preparation only; nothing deployed.**

For the separately requested shared ServerVerse VPS, see
[ServerVerse preparation and read-only host audit](serververse-readiness.md).
The VPS has not been accessed; do not apply the Neon/Cloudflare reference
configuration until the actual host, DNS and TLS topology are verified.

Production configuration targets an isolated PostgreSQL 17 instance and VTV services on the same ServerVerse VPS, private R2 originals, SMTP/Nodemailer, Stripe test billing, and independently supervised workers. Staging remains a separate environment. The actual ServerVerse capabilities and capacity are unverified. No VPS, DNS, Cloudflare account, database or customer service was contacted or changed.

Sprint update: [ServerVerse launch plan and current blockers](serververse-launch-plan.md); [verified-access instructions](serververse-access.md). The optional same-host originals adapter and scoped worker fence are prepared but remain disabled pending host acceptance.

Start with:

- [Runtime and migration audit](audit.md)
- [Architecture, exact initial resource allocation and credentials](architecture.md)
- [ServerVerse production PostgreSQL and same-host deployment readiness](serververse-readiness.md)
- [Neon connection contract retained for staging](neon.md)
- [Ubuntu, TLS, release and rollback runbook](runbook.md)
- [Security, backups, recovery and monitoring](operations.md)
- [R2 permissions, Stripe and SMTP acceptance](providers.md)
- [Acceptance ledger and remaining blockers](acceptance.md)

## Files

```text
deploy/
  environments/{staging,production}/   # separate secret-free templates
  systemd/                            # web, per-job workers, processing, ClamAV, backup timer
  nginx/                              # new named vhost only; no existing-site edits
  processing/                         # ClamAV bounds and image decoder policy
  postgres/roles.sql.template         # design only; NOT an approved migration
  ubuntu/                             # setup, verified release, rollback, backup and restore tools
  ci/linux-acceptance.sh               # disposable Linux runner only
scripts/deployment/                    # offline rendering, source inventory, Linux artifact build
workers/                              # independently compiled durable jobs and isolated decoder/OCR
.github/workflows/deployment-package.yml # build/verify/upload; no deploy credentials or deployment step
```

Render configurations locally without secrets or network:

```powershell
node scripts/deployment/render.cjs staging staging.vetthevat.com .deployment-review/neon-staging
node scripts/deployment/render.cjs production vetthevat.com .deployment-review/serververse-production
npm run deploy:inventory
npm run workers:build
npm run test:deployment
```

The renderer refuses an existing output directory. The production database port, host capacity, DNS and TLS topology must be confirmed by an authorized read-only host audit before deployment. Environment templates remain disabled and contain no working credentials. Do not copy `.env.local` or Windows `node_modules` to Ubuntu. Build the versioned standalone artifact on Linux in clean CI.

The managed schema is still a blocker: existing approved migrations are tied to the local operator, database name, cluster directory and privileged role provisioning. No SQL was rewritten, executed or newly approved during this package preparation. A provider-specific fresh bootstrap must be rendered, reviewed, checksummed and separately approved before any managed schema operation. The package intentionally has no automatic migration step.

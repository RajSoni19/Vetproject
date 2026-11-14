# ServerVerse production deployment preparation

**Status: NO-GO / preparation only.** No VPS connection was made, and no service,
package, database, DNS record, firewall rule, certificate, or existing website
was changed. The host may contain Inovetaa and other applications; their files,
users, Node/PM2 runtimes, ports, Nginx configuration, databases, and service
units are explicitly out of scope.

## What is known

- The local project is on Windows 11; this does not establish the VPS OS,
  capacity, installed software, or free resources.
- This workspace has no SSH config or SSH-agent identities. No remote login was
  attempted. A VPS address, approved SSH identity, and authorization for
  read-only inspection are still required.
- Public DNS currently resolves the apex through Cloudflare; `app.vetthevat.com`
  also resolves, while `www.vetthevat.com` and `staging.vetthevat.com` did not
  return A records during this audit. DNS resolution does not identify or prove
  control of the ServerVerse origin.
- A read-only HTTPS HEAD request to the apex reached Cloudflare and returned
  `403`. This is not evidence that the origin, application, or certificate is
  healthy. No challenge or access control was bypassed.
- The production package now has a fail-closed ServerVerse PostgreSQL 17 profile:
  a VTV-dedicated instance, TLS-verified loopback only, an installation-bound
  approved port, and same-host isolated web/worker services. `vetthevat.com` is
  the configured production origin. These are local preparation changes, not
  verified ServerVerse facts. Ubuntu 24.04, Node 22.23.4 x64, Cloudflare Origin
  Pull mTLS, Nginx and port availability remain unverified. Do not copy Nginx
  files to the VPS as-is.
- The previous offline deployment inventory stopped at migration 026. It now
  includes every forward `*.review.sql` file currently present (including 041)
  and verifies hashes for migrations pinned in the guarded runner. It still
  reports managed bootstrap as not ready. Migration 041's disposable rehearsal now passes with the separately reviewed 042 correction; live 041/042 remain unapplied; inventory inclusion is not approval
  to apply it.

Current sprint evidence and remaining gates: [launch plan](serververse-launch-plan.md). Access/fingerprint/account instructions: [access guide](serververse-access.md).

## Safe host inventory

After the VPS owner confirms the host fingerprint, user, key, and read-only
authorization, run this script in a read-only SSH session:

```bash
bash deploy/ubuntu/audit-host-readonly.sh vetthevat.com
```

It reports OS/runtime versions, CPU/memory/disk, running systemd services,
listening TCP ports, Nginx virtual-host names/listen directives, public
certificate subject/issuer/validity/SAN metadata, firewall summaries, local
PostgreSQL readiness, and DNS.
It never prints environment files, private keys, Nginx's full expanded
configuration, database URLs, or process environments. It deliberately does
not invoke `pm2 ls`: PM2 may start a daemon when none is running. If PM2 is
present, obtain its process list only through a separately approved,
owner-account-specific read-only procedure that verifies the daemon already
exists and redacts environment data.

Do not run `nginx -T` into chat/logs; it can expose credentials embedded in
existing configuration. Preserve the full output privately, redact unrelated
domains/IPs/users before sharing, and independently compare pre/post inventory
for every VTV operation.

## Proposed isolated architecture (conditional on inventory and approval)

- Use a new VTV-only release root such as `/srv/vetthevat/production` and
  root-owned, immutable versioned releases. Never place releases in an
  Inovetaa/application directory.
- Create dedicated `vtv-*` non-login service users only after confirming those
  names do not already belong to another application. Use a VTV-only service
  manager unit (prefer systemd if the host supports it); do not change global
  Node, PM2, startup scripts, or package versions.
- Bind the web process to loopback on a port selected only after inspecting
  current listeners. The prepared profile uses port 3200; this is not approved
  until verified free. Do not expose Node directly to the Internet.
- Add a separate, uniquely named Nginx site only after determining the actual
  TLS/Cloudflare topology. Never replace a default site, edit global Nginx
  settings, change Cloudflare, or reload Nginx without separate approval and
  a successful config test plus existing-site health checks. The prepared
  named-site template emits HSTS for that host only (no `includeSubDomains`).
- Keep original invoices in the existing private R2 integration, with exact
  account/bucket/prefix-lock approval and independent file recovery. Do not
  expose originals or store them in the release tree. No bucket or credentials
  have been provisioned or verified.
- Run inspection/extraction as separate low-privilege VTV services with
  ClamAV/Tesseract/Poppler and the existing processing isolation. Enable no
  worker until the production DB, object storage, scanner signatures, resource
  bounds, queue fence and synthetic acceptance pass. Do not start workers as
  part of host discovery.
- Use a VTV-dedicated PostgreSQL 17 cluster and database with isolated
  non-login owners and service-specific runtime roles. The application profile
  accepts only loopback TLS and an exact installation-bound port; no public
  PostgreSQL listener is permitted. Keep the migration owner credential off
  web/worker environments. Never point production at the local development
  database or alter an existing shared cluster.
- Configure private environment files with mode `0600`, not in a release,
  shell history, CI artifacts, or chat. Do not enable Stripe live billing:
  current code/templates support test billing only. Production mail, contact,
  R2 originals, migrations, backups, and monitoring each require their own
  credentials and acceptance evidence.
- The existing release/rollback scripts atomically switch an application
  release and explicitly do not migrate or roll back the database. Keep that
  property. Database rollback is a separate reviewed restore/migration plan;
  never restore over production as an application rollback.

## Deployment blockers and required inputs

Before preparing a ServerVerse-specific release, collect:

1. Approved VPS address, verified SSH host key, read-only account, and a
   separate later change/deploy authorization.
2. Sanitized audit output, including other active sites/processes/ports and
   available CPU/RAM/disk headroom.
3. Confirmed hostname(s), DNS provider/zone ownership, proxy/CDN status,
   origin TLS method, and whether the existing Cloudflare Origin Pull setup is
   required.
4. PostgreSQL 17 availability or a VTV-only cluster plan, unused loopback port,
   verified TLS CA/SAN, separate database/role credentials, approved fresh
   bootstrap migrations, encrypted off-host backup destination, and an isolated
   disposable restore target.
5. Private original-storage provider and access policy; independent database
   and original-object backups with a successful restore drill.
6. Secret-management method, SMTP sink/provider, monitoring/alert owners, and
   incident contacts. Secret values must be supplied privately, never in chat.
7. Confirmation that the target host has sufficient isolated capacity for
   PostgreSQL, Next.js, OCR and ClamAV without consuming other applications'
   resources. The current caps require up to 3 GiB for ClamAV and 2 GiB for
   bounded processing, in addition to the database, web app and OS.

## Release and rollback sequence (not authorized yet)

1. Complete read-only host audit and baseline health checks for every existing
   site. Select an unused VTV port and exclusive paths.
2. Produce a clean Linux build in pinned CI; verify artifact hash, dependencies,
   security/test results, migration inventory and absence of secrets.
3. Review the exact host-specific Nginx/site and service-unit diff. Install
   only new VTV files/users/directories. Do not install/upgrade shared packages
   until simulations and the host owner approve them.
4. Prepare and independently approve a production database bootstrap and
   least-privilege grants. Back up, restore-test, and execute migrations only
   under their separate explicit approval.
5. Install private env/config files; start only the VTV service after approvals.
   Run private health and synthetic tenant/upload/OCR smoke tests.
6. Recheck existing site health. Enable DNS/proxy/certificate changes only
   after origin validation and separate DNS/CDN approval.
7. On an application regression, atomically restore the previous VTV release,
   restart only VTV units, and verify health. Do not undo schema/data with the
   app symlink rollback; use a separately approved forward fix or recovery plan.

Expected downtime cannot be estimated until the host's current routing, process
manager, capacity, and database migration impact are known. With an already
configured reverse proxy and additive VTV-only units, an application release
can be a brief process restart; DNS/TLS or schema work can require a maintenance
window. No downtime commitment is made.

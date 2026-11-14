# Shared invoice allowance and security foundation

Prepared 20 October 2026. Local implementation only; no service configured,
database contacted, migration executed, image built/published or deployment run.
The immutable `D:\vetthevat-backup` and browser-local records were not changed.

## Confirmed account rule

- One account has **100 invoices per monthly billing period across its companies**.
- Company A using 70 leaves 30 for company B. Both uploads and manual invoices count.
- Invoice edits and retries of the same saved invoice must not count again.
- A company switch must not reset usage. Browser counters cannot enforce this rule.

The proposed counting point is the first successful invoice save, including a draft;
failed extraction alone would not count. Confirm draft counting, deletion refunds,
upgrades, cancellations, trial allowances and billing timezone before enabling billing.
Periods should follow the authoritative subscription billing anniversary, with inclusive
start/exclusive end; they are not assumed to be calendar months. Keep prior usage
history rather than deleting/resetting rows at renewal.

## Implemented, with explicit boundaries

`lib/server/account-usage.ts` defines the 100-invoice policy and a trusted company-to-
billing-account resolver plus atomic usage ledger ports. It rejects absent services,
unverified membership, expired periods and inconsistent usage. The authenticated
internal user ID comes from the existing identity port; request bodies must never
choose the account or allowance. `usage-services.ts` is the server-only entry point.

There is **no concrete ledger, billing-account schema, authenticated route or frontend
quota counter**. These contracts are not live enforcement. The eventual PostgreSQL
transaction must verify membership/company ownership and reserve against a locked
account-period row, counting pending plus committed slots. Use unique account/period/
invoice identity, reject ownership changes on retries, and commit invoice/usage/audit
atomically. Failed saves release reservations; crash recovery must handle abandoned
reservations. Existing committed invoices require an explicit idempotent update path,
including edits after a period changes. Test this against real PostgreSQL before release.

`lib/server/request-limits.ts` defines an atomic, shared-store limiter contract; missing
store fails closed. API errors support HTTP 429 with Retry-After, no-store and a request
ID. No endpoint currently consumes it, and no process-local Map is sold as protection.
Before enabling routes, enforce account/user/IP limits at entry points, upload byte/
page/concurrency limits and spending limits for OCR, email, VAT lookup and payments.
Derive identities from verified sessions and IPs from the reviewed proxy chain.

`infra/nginx.review.conf` proposes separate API/general IP limits, connection limits,
request size limits and timeouts. It is **review-only**, not attached to Compose or
the running application. Thresholds are provisional and need workload testing. TLS,
trusted proxy topology and host validation require the eventual hosting decision.
Rate limiting does not replace authentication, tenant isolation or authorization.

## Container and CI preparation

- `Dockerfile`: multistage standalone Next build; dependency scripts disabled;
  non-root final image; only built runtime/public assets copied. Standalone output
  is opt-in through `VETTHEVAT_BUILD_STANDALONE=1`; normal Windows builds retain
  their existing output mode. No build-time credentials are needed.
- `.dockerignore`: allowlisted source/build/test inputs; excludes recovery copies,
  database files, environment files, logs and typical credential filenames. Still
  review source/public/test assets for accidentally committed private content.
- `compose.yaml`: local loopback exposure, read-only filesystem, temporary writable
  cache, dropped capabilities, no-new-privileges and resource limits. No database
  service, credentials, mounts of owner files or production settings.
- `.github/workflows/verify.yml`: least-privilege permissions, commit-pinned official
  actions, clean locked dependency install, unit/build/type/browser checks, high-
  severity dependency audit gate and local image build. No image push or deployment.
  Browser tests use isolated synthetic profiles and an explicit Chrome path.

Git is still absent, so this workflow is **inactive**. Owner must approve a repository,
protected branch/environment rules and hosting/registry choices. Configure the
non-secret repository variable `NODE_IMAGE` to a reviewed official Node 22 Debian
image reference **pinned to its actual SHA-256 digest**; no digest was invented.
Docker is unavailable locally, so image build/start and non-root/read-only health
checks remain unverified. Do not treat YAML parsing as container execution.

After those decisions, CD should build once, scan image/dependencies/secrets, produce
SBOM/provenance, sign and promote the same digest through staging and approved
production deployment. Require tenant/concurrency tests, backup/restore proof,
rollback readiness and an explicit deployment approval. No CD deployment was added.

Design references: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[Docker build guidance](https://docs.docker.com/build/building/best-practices/),
[GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use).
Installed Next documentation was inspected before modifying next.config.ts.

## Actual verification and release blockers

- TypeScript passed; production build passed (42 static pages).
- `npm test`: 65 passed, zero failed. New tests cover shared 70/30 usage, repeated
  saves, competing final reservations through an injected atomic test double,
  account period resolution, fail-closed errors and 429 headers. They do not prove
  PostgreSQL atomicity or a real distributed rate limiter.
- `--supplier-only` browser regression passed manual draft/reload/edit/confirmation
  and supplier auto-link/GOV.UK-check presentation using synthetic records.
- Full browser suite (`--stage2 --stage3 --milestone1 --milestone2 --frontend
  --frontend-batch2`) passed OCR PDF/PNG/JPG/JPEG, retry/recovery, invoice edits,
  drafts, filters/exports, company/supplier/document journeys, banking allocations/
  reversal and responsive/keyboard checks at 320/390/768/1024/1440 widths. No uncaught
  page exceptions. Existing synthetic screenshots were refreshed; originals are
  recoverable in the foundation snapshot. No ORS development was performed.
- Compose and workflow YAML parsed with the existing PyYAML installation.
- Read-only `npm audit`: **6 high, 2 moderate, 0 critical** findings. Reported packages:
  braces, chokidar, fast-glob, micromatch, tailwindcss, xlsx (high);
  postcss-nested, postcss-selector-parser (moderate). These are package findings,
  including dependency-chain effects, not eight demonstrated exploitable app paths.
  npm reports no available registry fix for installed xlsx, and suggests a major
  Tailwind upgrade for several findings. Do not run an automatic major upgrade.
  Review patched sources/replacement options and import/export regression coverage
  before requesting exact dependency changes. No packages/lockfile were changed.
- CI would currently fail its high-severity audit gate; no successful CI run claimed.
- Existing lint script uses removed `next lint`; no lint pass is claimed. A reviewed
  lint tool/config requires separate dependency approval.
- No Docker build, proxy validation, database concurrency/RLS test, Firebase verifier,
  active subscription integration or penetration test was performed.

## Required next approvals

1. Billing-account ownership/membership model and invoice counting edge cases above.
2. Separate authorization for database schema review/execution, synthetic concurrency
   tests, authenticated account resolution and a durable usage ledger; preserve all
   existing local records and require a separate import approval.
3. Select shared rate-limit storage and hosting/proxy/TLS topology; review thresholds.
4. Review exact dependency remediation proposals, lint tooling and a pinned container
   image before installation/image retrieval. No software was installed here.
5. Approve Git/repository/registry and staged CD setup separately. No remote added.

The earlier renewal email, recurring card/Direct Debit and automatic HMRC lookup
requirements still need provider/access decisions. No reminder email, payment or
HMRC verification success is fabricated. The application remains browser-local/demo
and is not claimed production-ready or fully secured.

## Recovery

Recoverable pre-edit originals are in
`.recovery/quota-security-20261020-202839`. See the accompanying change inventory.
Rollback, if later approved, restores only listed modified originals and removes
only listed newly added foundation/configuration files after reviewing current
changes. No rollback, removal, browser reset or database operation was performed.

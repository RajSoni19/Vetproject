# Service activation — pending exact approvals

The request to make every listed service available is being treated as an
implementation request, not authorization to relabel incomplete services.
Earlier restrictions requiring separate migration approvals remain in effect.

The next concrete operation is to install the already reviewed invoice/VAT and
contact foundations in the existing approved isolated database. The user has been
asked separately about those exact hashes and approved external providers. No
answer or consent is inferred from elapsed time.

| Reviewed SQL | SHA-256 | Target |
| --- | --- | --- |
| `003_stage_b_invoices.review.sql` | `a881b6bd1278f8bdcd0a0ae74739eb5cdd07defb8883c19f89aea79ecfd5887b` | `127.0.0.1:55440/vtv_saas_dev` |
| `004_public_contact.review.sql` | `a8d47899caec449f7ec4be000a043952e8fd1eba73a7bfd2ea7e72d8f7d087a1` | Same isolated database |

The cluster is `D:\vetthevat.saas-dev\cluster`. Port 55439 and production/mobile
services remain excluded. The full reviewed objects and recovery limits are in
`docs/stage-b-migration-review.md` and `docs/local-real-login-results.md`.

## Prepared execution tool

`scripts/saas-reviewed-migration.cjs` supports only those two exact files. Default
behavior is a no-connection/no-write preview:

```powershell
node scripts/saas-reviewed-migration.cjs 003
node scripts/saas-reviewed-migration.cjs 004
```

Execution additionally requires the exact separately approved hash selector and
`--execute`, followed by actual tool approval for the private cluster directory.
No execution has been performed by preparing or testing this tool.

The tool checks exact database/role/address/port/data directory and installation,
Stage A hashes/corrective policies, absence of the new schema and role, and the
reviewed hash again immediately before SQL. It creates fresh timestamped custom
database and private role backups, validates the archive listing and all backup
checksums, then executes one reviewed transaction and requires COMMIT. It issues
no password/grant/DDL outside that file, never drops/overwrites/retries an existing
schema and preserves uncertain outcomes for operator inspection. New runtime
roles have no password provisioned by this tool. Private backup ACLs must be
checked before the approved execution; a restore drill remains separately scoped.

After approved execution, run real catalog/RLS/invoice/contact tests. If SQL fails
or a security defect appears, stop at a new corrective-migration approval rather
than changing the already approved file or disabling checks. Enable individual
financial endpoints only after their actual authorization/persistence/isolation
tests pass. No provider, fake entitlement, clean-file receipt or email acceptance
is substituted by the script.

## Infrastructure answers still required

- Private storage with versioning and durable private volume; trusted malware
  scanner/decoder and isolated OCR workers.
- Verified transactional-email provider/sender and anti-spam configuration.
- Approved payment provider, webhook secrets and lifecycle testing environment.
- Later managed production database/workers/monitoring/backup restoration, under
  separate approval; the local database is not exposed or deployed.

Share provider names or existing private configuration locations, not secret
values in chat. Existing mobile production credentials will not be reused.

Current label changes: **none**. Migrations applied: **none**. Features newly
claimed operational: **none**. Three new executor tests check exact-file selection,
no-write preview and denial before connection without the approval selector.
These are safety tests, not real invoice/contact integration passes.

Files changed for this step: `scripts/saas-reviewed-migration.cjs`,
`tests/reviewed-migration.test.cjs`, `.vercelignore` and this document. All
previous readiness reports remain historical evidence of their stated scope.

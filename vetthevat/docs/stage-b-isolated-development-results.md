> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Stage B isolated development results — 23 October 2026

The reviewed invoice/VAT and contact-intake migrations are committed only in
the isolated PostgreSQL 17 development database at
`127.0.0.1:55440/vtv_saas_dev`. The local application now exposes a small,
database-backed manual VAT workflow to authenticated members of an already
provisioned development company. It is not released for production use.

## Applied database sources

- `003_stage_b_invoices_syntax_fix.review.sql` committed with SHA-256
  `0cbf009b4eb221e8c78c277d12899bff070601afbb4227e3aa113f88f26ab2c0`.
  This was the separately approved correction of the original 003 trigger
  syntax. The original 003 source is retained unchanged; its transaction
  rolled back and it is not recorded as applied.
- `004_public_contact.review.sql` committed with SHA-256
  `a8d47899caec449f7ec4be000a043952e8fd1eba73a7bfd2ea7e72d8f7d087a1`.

Fresh, verified pre-migration custom/role backups were created for both
executions. The exact execution record is in
`docs/stage-b-development-execution.json`.

## Available in the isolated environment

Authenticated members with an existing, entitled development company can
create suppliers/customers, draft and explicitly confirm manual invoices,
view confirmed VAT totals, and download company-authorized PDF/XLSX exports.
Each command repeats server-side session, CSRF, membership, permission,
company-selection and PostgreSQL RLS checks. New company provisioning remains
blocked until entitlement-aware provisioning is implemented.

The public contact schema is durable and tested, but the public endpoint stays
disabled because spam protection and approved Resend delivery credentials are
not configured.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Automated suite | 241 passed, 0 failed |
| Stage A PostgreSQL/HTTPS | 19 passed |
| Account PostgreSQL | 4 passed |
| Invoice/VAT PostgreSQL | 13 passed |
| Contact PostgreSQL | 8 passed |
| Production build | Passed, 57 routes generated |
| Chrome browser, 1440px and 390px | Passed |

The browser run used disposable verified identities and isolated companies. It
persisted a supplier and manual purchase invoice, confirmed a gross total of
120.00 with 20.00 input VAT, checked authorized PDF/XLSX downloads, refreshed
the record, rejected another company's identifier, and checked logout and
revocation. Screenshots are retained under `docs/previews/saas-stage-a/`.

## Still unavailable

Private R2 original storage, ClamAV scanning, OCR, invoice uploads, payment
allocation, banking, Stripe billing, ORS, production identity/email delivery,
and real outbound email remain disabled. Provider adapters and protocol tests
exist, but no provider account, credential, worker, storage bucket, durable
webhook inbox, or live service verification was created. No financial API
outside the manual allowlist is enabled.

No connection was made to `127.0.0.1:55439/vtv_web_auth_test`, production
Firebase, mobile/Flutter data, Vercel, Cloudflare DNS, GoDaddy DNS, or customer
data. No deployment occurred.

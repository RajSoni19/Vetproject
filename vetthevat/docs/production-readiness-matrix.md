> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Production readiness matrix — 23 October 2026

This matrix distinguishes verified isolated development behaviour from provider
configuration and production-release work. It does not authorize deployment.

| Area | Status | Evidence / production blocker |
| --- | --- | --- |
| PostgreSQL web authentication, sessions and company RBAC | Real isolated service verified | 19 Stage A and 4 account scenarios passed. Production needs a separately provisioned managed database and identity/mail configuration. |
| Manual invoices, contacts, VAT and exports | Real isolated service verified | 13 PostgreSQL scenarios and desktop/mobile browser workflow passed. Only already-provisioned development companies can use it. |
| Private document workflow | Implemented, external configuration pending | Reservation, quarantine, authorization, R2 adapter, ClamAV protocol and worker contracts exist. R2 bucket, isolated scanner/decoder host, worker credential and live provider tests are absent. |
| OCR and review | Implemented contracts, external configuration pending | Durable extraction tables/leases and review-required results exist. No trusted OCR worker is configured or enabled. |
| Public Contact / Get Started | Durable schema verified; endpoint disabled | 8 PostgreSQL scenarios passed. Turnstile and approved Resend sender/credentials plus delivery worker are required. |
| Stripe billing and entitlement lifecycle | Adapter/protocol tests only | Test-only signature, Checkout, Basic-only ORS add-on and Billing Portal adapters exist. A durable inbox, provider worker, Stripe account/test credentials, price IDs and lifecycle mapping remain required. |
| Provider webhook inbox | Real isolated PostgreSQL verified; worker/configuration pending | Migration 005 committed with forced RLS, a least-privilege insert role, durable idempotency and rollback/denial tests. No webhook route or provider worker is enabled. |
| Banking and reconciliation | Not implemented server-side | Existing browser-local interface remains unavailable in the authenticated application. Requires its own tables, import/reconciliation controls and migration approval. |
| ORS procurement, inventory and sales | Server contracts implemented; persistence not implemented | Strict request/receipt/adjustment/sales-order contracts now reject client ownership selectors, duplicate lines, malformed dates and unsafe quantities. Requires a separate schema for orders, stock ledger/reservations, fulfilment, returns and matching before any endpoint can be enabled. |
| Company onboarding and teams | Not implemented server-side | New company provisioning remains fail-closed. Requires entitlement-aware provisioning, invitation delivery and membership commands. |
| Administrator dashboard | Partially implemented | Secure administration routes remain protected; production administrator identity/grant and lead-management activation are not provisioned. |
| Monitoring, backup/restore and deployment | Not implemented | Managed service configuration, alerting, restore drill, production environment validation and owner-approved deployment are required. |

## Next migration review

`database/migrations/saas/005_provider_event_inbox.review.sql` has SHA-256:

`5a3744e9aefbb40f6134a1ed032c994c9162b5efaecfe2a5d5f3e8b27d23a816`

It creates one private `saas.provider_events` table, one pending-work index,
the least-privilege `vtv_saas_provider_runtime` role, forced RLS, and the
`saas.record_provider_event` security-definer insertion function. It changes
no existing rows, grants no browser-facing table access, starts no worker and
does not enable Stripe or Resend. The migration must run in a single
transaction after a fresh verified custom/roles backup. On failure or an
uncertain commit, preserve the isolated cluster and backup for inspection; do
not retry or roll forward automatically. A restore drill requires a fresh,
separately approved target.

After this migration is tested, the next approvals should remain separate:

1. Isolated R2 bucket/immutable lock and ClamAV/decoder worker configuration.
2. ORS and banking schema migrations, each with its own table/RLS/transaction
   review and cross-company integration tests.
3. Stripe/Resend test credentials and service-backed webhook/delivery tests.
4. Production managed infrastructure, restore drill and deployment approval.

## Stripe placeholder contract

The gitignored local environment and `.env.example` now contain blank values for
`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_BASIC_PRICE_ID`,
`STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, and
`STRIPE_ORS_ADDON_PRICE_ID`. The adapter also requires explicit test-mode flags
and a pinned Stripe API version. Blank or incomplete configuration returns an
unavailable state; it cannot create a Checkout session, portal session, payment,
or entitlement.

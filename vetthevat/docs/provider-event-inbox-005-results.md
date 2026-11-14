# Provider-event inbox migration results — 23 October 2026

Migration `005_provider_event_inbox.review.sql` committed once in the approved
isolated PostgreSQL 17 target `127.0.0.1:55440/vtv_saas_dev`.

- SHA-256 verified before execution:
  `5a3744e9aefbb40f6134a1ed032c994c9162b5efaecfe2a5d5f3e8b27d23a816`
- Fresh pre-migration backup:
  `D:\vetthevat.saas-dev\backups\migration-005-before-20261023173219829-d992b762-46b6-426a-bfef-df86a145e359`
- Backup archive and role dump checksums were validated. The execution record
  acknowledges `COMMIT`; no restore drill was run.
- No password was persisted for `vtv_saas_provider_runtime`, no provider was
  contacted, and no webhook route or worker was enabled.

Real isolated PostgreSQL tests passed for:

1. Forced RLS, owner-only policy, constrained non-superuser runtime role, and
   no direct runtime table privileges.
2. Security-definer event insertion, durable queued persistence, exact-duplicate
   idempotency, and conflicting event-ID rejection.
3. Transaction rollback and denial of the function to the web runtime role.
4. Re-execution refusal before backup or SQL execution once the migration state
   exists.

The test used a random temporary local role password and disposable events; it
removed both in cleanup. It did not connect to Stripe, Resend, production
systems, the old `55439` authentication database, Firebase, Vercel, DNS, mobile
applications, or customer data.

The inbox is a durable acceptance boundary only. A separate reviewed migration
is needed for a leased provider-event worker, Stripe entitlement reconciliation,
Resend delivery-state handling, and audit/retention rules. Stripe Checkout,
Billing Portal, and incoming webhooks remain disabled without approved isolated
credentials and real provider integration tests.

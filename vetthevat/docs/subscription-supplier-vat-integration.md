# Subscription renewal, autopay and supplier VAT — 20 October 2026

## Owner requirements

Confirmed: renewal warnings must appear in-app AND by email. No email service is
currently configured. Autopay must support recurring cards AND bank Direct Debit.
The supplied live address was corrected to `https://web.vetthevat.com`.

## Verified site/repository findings

- Public unauthenticated GET to that address returned HTTP 200, title VET THE VAT
  and a Flutter web shell loading `flutter_bootstrap.js`. This is different from
  the local Next.js source. The shell has no readable services/subscription page
  content or pricing links. Live plan/pricing/renewal behaviour was NOT verified.
  Text browsing could not load it and the in-app browser tool failed to initialize.
  No sign-in, Firebase API call, production mutation or Flutter modification occurred.
- Local `/app/subscription` is informational: no real expiry, payment method,
  subscription provider or renewal scheduler. Its proposed Starter/Business/Scale
  names differ from public local `/pricing` Starter/Professional names. Owner must
  provide the canonical live catalog, prices, periods, service entitlements and
  existing billing architecture before integration. Do not infer them from UI cards.
- `AppStateProvider.saveInvoice` previously saved invoice/document links without
  creating a supplier. This batch now resolves/creates the company supplier as part
  of the same browser-local commit. No supplier is created halfway through OCR.

## Implemented locally

`lib/invoice-supplier.ts` matches a selected company supplier, otherwise uses
unambiguous name/VAT evidence. New saved purchase/unclassified supplier invoices
create a supplier in Review status, with actual invoice name/VAT and empty unknown
contacts. Repeated saves reuse it. Sales do not create suppliers from seller details.
Conflicting VAT/name or archived candidates stay unlinked in drafts and block
confirmation until explicitly resolved. Cross-company links are rejected. Existing
supplier contact details and historical invoice snapshots are never overwritten.
Company records remain browser-local, not a secure durable shared supplier database.

Supplier Add/Edit dialog now includes the official GOV.UK checking link. Opening
that page does not mark the supplier verified. Automatic verification is explicitly
unavailable until HMRC integration exists. No scraping, invented registration
result or client-side HMRC secret is introduced. All existing financial math stays.

Files: `components/app-state.tsx`, `components/entity-fields.ts`,
`components/record-form-dialog.tsx`, new `lib/invoice-supplier.ts`, supplier unit and
browser tests, browser runner flags. Originals:
`.recovery/supplier-billing-20261020-201841`. Immutable backup untouched.

## Concrete backend implementation proposal — not active

1. **Subscription authority:** verified identity/company membership; authoritative
   subscription records with provider customer/subscription/price IDs, period end,
   cancellation-at-end, auto-renew consent, currency/amount, and pending/active/past-due/
   cancelled/expired states. Never infer entitlement from a browser toggle or plan card.
   Reuse the actual published app's billing owner/API if verified; do not create a
   separate competing authority or change the released Flutter app.
2. **In-app and email reminders:** proposed schedule 30, 7 and 1 days before expiry
   (owner confirmation pending). Use a server scheduler and durable outbox, unique
   subscription+period-end+threshold+channel keys, retries, deduplication, delivery
   status and bounce handling. Recheck current expiry/state before sending; handle
   renewal, cancellation and paused/payment-failed cases without stale reminders.
   Annual/monthly cadence, timezone and grace-period wording need approval. Auto-renew
   users receive upcoming-charge notices; cancelled users receive expiry/renew notices.
   Jobs must work when the browser is closed. Do not use localStorage timers as email
   delivery or claim an email was sent before provider acceptance.
3. **Cards and Direct Debit:** Stripe Billing/hosted Checkout is one viable option
   supporting cards and UK Bacs subscriptions; provider selection is NOT approved
   or provisioned. Bacs needs provider eligibility/approval and a customer mandate;
   payment settlement is asynchronous. Do not mark a pending debit paid or activate
   solely because checkout returned. Hosted collection should keep card/bank details
   out of this application's database. Handle signed replay-safe webhooks,
   out-of-order events, idempotency, retries, failures, cancellation and payment updates.
4. **Email provider:** owner selects an approved transactional service and sender
   domain/address. Need verified sender/domain and required DNS records, secure
   server credentials, templates, delivery callbacks and an approved budget. No
   email provider was chosen, account created, DNS changed or email sent.
5. **HMRC VAT checking:** use official Check a UK VAT number v2 from the server with
   approved credentials. Let users opt in on supplier Add/Edit, validate supported
   UK number format, show checking/valid/invalid/unavailable distinctly, and present
   returned legal name/address for comparison rather than silently replacing saved
   details. Persist check time, submitted number, provider version/result and reference
   where supplied. Editing the VAT number invalidates prior evidence. Rate limits,
   retries/cache and minimal logging need tests. A format check is not registration
   verification, and no VAT result determines invoice VAT recovery automatically.

## Required access and remaining approvals

- Canonical live services/plans/prices/renewal periods and the Flutter web billing
  source/maintainer contract. Live subscription screens have not been inspected.
- Approval of a payment provider, its card/Bacs capabilities and fees, hosted checkout
  and cancellation/grace policy. No fees are quoted or paid setup authorized here.
- Approval of an email provider, sender identity/domain and reminder schedule.
- HMRC developer registration, sandbox access and later production approval. Official
  guidance says registration can take around two weeks. Do not post secrets in chat.
- Explicit authorization for backend identity/storage integration, database writes,
  migrations, scheduler/webhook hosting and any additional exact dependencies.
  Those operations remain outside the currently paused PostgreSQL/frontend scope.

Acceptance: no duplicate reminders on retries, correct period rescheduling after
renewal, real pending vs settled debit states, card failures/cancellation honoured,
company isolation, real mail acceptance status, no card/bank secrets stored, repeated
invoice saves create one supplier, conflicting identities require review, and HMRC
failures never become 'verified'. Synthetic/sandbox testing precedes live enablement.

References: [GOV.UK manual check](https://www.gov.uk/check-uk-vat-number),
[HMRC check API v2](https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-registered-companies-api/2.0),
[Stripe Bacs](https://docs.stripe.com/payments/bacs-debit),
[subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

Verification: 60 unit tests passed; TypeScript and production build passed. Full isolated Chrome regression (`--stage2 --stage3 --milestone1 --milestone2 --frontend --frontend-batch2`) passed, including actual digital/scanned PDF and image OCR. New `--supplier-only` check passed creation/reload/reuse and GOV.UK link/unavailable API states. Existing financial calculation, extraction, export generation and workspace serialization files were not edited. No new package was installed. Exact paths/hashes are in `subscription-supplier-change-inventory.json`.
Emails, reminders, autopay and automatic HMRC checks are NOT active in this batch.

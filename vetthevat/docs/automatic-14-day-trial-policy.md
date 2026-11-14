# Automatic 14-day trial policy

The first successfully onboarded company for a verified web-auth user starts one 14-day trial in the same PostgreSQL transaction. The trial uses the Starter entitlement limits (100 invoice creations per month, two companies, four seats, 180 days of history, and ORS enabled). No payment card is requested, no payment is recorded, and no automatic charge is scheduled.

`saas.trial_history.actor_id` is unique for the lifetime of the verified user record. Additional companies share the same billing account and allowance; they do not start or extend a trial. Repeated onboarding requests are protected by the existing per-user idempotency ledger. A converted or expired trial remains in the history and cannot be reissued to that user.

This policy can prevent repeat trials for the same verified account. It cannot determine whether different email addresses belong to the same person; there is no verified identity provider or payment identity available to safely link them. It does not claim one-trial-per-human enforcement.

The expiry timestamp is authoritative in PostgreSQL. At expiry, company writes are denied while role-authorized reads and exports remain available. The stored trial status is refreshed when the account subscription summary is read. A verified paid Stripe subscription can convert the existing entitlement; the Checkout return URL alone cannot.

The reviewed migration is not applied. Local onboarding remains gated until exact-checksum approval and installation in `127.0.0.1:55440/vtv_saas_dev`.

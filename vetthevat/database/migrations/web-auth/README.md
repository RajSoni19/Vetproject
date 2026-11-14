# PostgreSQL web authentication migration

`001_web_auth.review.sql` was approved and applied **only** to a NEW PostgreSQL
17.11 cluster at `127.0.0.1:55439`, database `vtv_web_auth_test`, under
`D:\vetthevat\.auth-pg\cluster`. Approval did not cover existing databases,
production connections, administrator creation or email delivery.

Approved SHA-256:
`19EFFF1A3945E02FC2936103C6B9CE26536CEA87A4EEE0D3A85E733DA3AE6FD8`.

The migration is transactional and refuses existing web schemas or named roles.
It creates no customer account, administrator account or company. The single
`software_administrator` role row is a role definition, not a user grant.

`vtv_web_owner` owns the schemas and cannot log in. `vtv_web_runtime` has bounded
authentication grants, cannot assign software administrator roles, alter account
status or edit/delete audit records, and has no financial table grants.
`vtv_web_business` cannot read authentication secrets and uses forced RLS on
tenant business tables. A security definer with a fixed search path resolves a
live, verified, active session plus an active company membership and capability.
Setting a user UUID or claiming a company ID does not authorize access. The
business session context must be transaction-local.

Foundation tables cover invoice lines, contacts, document object metadata, ORS
orders/items and inventory with composite tenant foreign keys. No document bytes
are stored here. Global foundation leads have no runtime/business grants; the
existing dedicated PostgreSQL lead-intake adapter remains separate and disabled
until independently configured. These business tables/repositories do not enable
financial HTTP endpoints or replace the existing accounting transaction design.

No migration runs on import, build or application startup. Do not re-run the
initializer against the existing test cluster. Production requires a separately
approved empty target, role provisioning, migration review, TLS, installation
fingerprint, pooling and operator plan. Do not apply this file to a shared or
production database merely because it succeeded locally.

# Firebase identity integration prerequisites

Confirmed owner decision: keep the published Flutter application's Firebase
Authentication unchanged. PostgreSQL will own VAT business data; private object
storage will own original bytes. No Firebase SDK or provider was accessed or
installed for this milestone. `lib/server/identity.ts` is an integration port,
not a token verifier or a working sign-in flow. No fake authenticated user exists.

Before implementing an Admin SDK adapter, obtain approval for its exact pinned
package/version and verify Node/Next compatibility. Obtain project ownership and
the correct project ID through the owner, approved web domains, sign-in providers,
email verification policy, MFA requirements, and emulator setup. Do not ask for a
private key in chat. Prefer approved platform application-default credentials;
otherwise use a restricted private credential file outside source with Windows
ACLs and a server-only path. Public web Firebase configuration does not replace
Admin verification and must never contain service-account secrets.

The adapter must verify signature, issuer, audience, expiry, revocation/disabled
state and the expected project. Emulator acceptance is restricted to local demo
projects; production explicitly rejects emulator variables. Firebase UIDs are
mapped by project+UID, not email. Local demo Team entries cannot grant membership.
Server membership/capability resolution must fail closed and be refreshed on each
protected operation. RLS is secondary protection, not identity verification.

Approve web session design (HttpOnly, Secure, SameSite cookies, bounded lifetime,
rotation, CSRF/origin controls, token hashing and server revocation). Do not store
session/refresh tokens in localStorage. Web logout should revoke its web session,
not globally revoke Flutter refresh tokens by default. Password reset/provider
changes/global user disable can affect mobile identity and require coordination.
The candidate web_sessions table is a proposal, not a selected working strategy.

Flutter developer must supply (through an approved channel) project identity,
supported token/API contracts, UID lifecycle, claims usage, existing security rules,
collections/object paths and ownership evidence, document-link formats, offline
sync and retry behaviour, released versions and compatibility/release constraints.
Do not connect Flutter to the new API or change its database/storage while it
remains published unchanged. Firebase business data is not available in this repo.

Private storage provider, region, budget, encryption/key ownership, retention,
versioning, malware handling, maximum files, backup/restore and URL lifetime still
need approval. Do not publish object keys, permanent token URLs, or real originals
in tests/logs. Supplier matching must be company scoped, use verified identifiers
where available, and send ambiguous matches to Needs Review without a forced merge.

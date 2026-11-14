# Android App API Integration Plan

Vet the VAT already has Android user/admin apps. The web admin should not create a separate production data island unless the current backend is unsuitable.

## Recommended Decision

Use the **existing shared backend API** that powers the Android apps.

The web app should become another authenticated client:

```text
Android user app  \
Android admin app  > Shared authenticated API > PostgreSQL > Private document storage
Web admin app     /
```

This keeps users, companies, invoices, suppliers, documents, permissions and audit history in one source of truth.

## Do Not Connect To The Android App Itself

The website should not connect to the Android APK or mobile application runtime. It should connect to the backend service used by those apps.

## Required From The Existing App Team

- API base URL for staging and production.
- Authentication method: JWT, OAuth, Firebase Auth, custom session, or another provider.
- Token refresh flow and logout/revoke behaviour.
- Existing user roles and permission names.
- Company/business membership model.
- Invoice, supplier, document, user and admin endpoint documentation.
- File upload method and file size limits.
- Original invoice download method: signed URL or authorised proxy endpoint.
- Error response format.
- Pagination/filter/sort conventions.
- Rate limits and idempotency requirements.

## Web Adapter Boundary

The web app should talk to the backend through a small adapter layer, not scattered `fetch` calls from every component.

Suggested modules:

- `lib/api/client.ts` for authenticated request handling.
- `lib/api/invoices.ts` for invoice upload, review, save and search.
- `lib/api/admin.ts` for users, roles and audit events.
- `lib/api/documents.ts` for signed upload/download flows.
- `lib/api/reports.ts` for export jobs and download links.

## When To Build A New Backend

Build a new backend only if one of these is true:

- The Android apps currently have no backend.
- The current backend cannot support multi-tenant web admin access safely.
- The current backend has no maintainable authentication or permission model.
- The current backend cannot store invoices/documents securely.
- The business wants to replace the Android backend with a new shared backend for all clients.

If a new backend is required, use PostgreSQL, server-side authorization, private document storage and versioned API routes from the beginning.

## Production Blockers

Until the real API details are supplied, this web app must remain clearly labelled as using demo/local adapters. Do not claim production sync with Android apps until the integration is implemented and tested.

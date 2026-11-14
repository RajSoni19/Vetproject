> Current delivery evidence: [26 October 2026 checkpoint](final-delivery-checkpoint-2026-10-26.md). The descriptions below are historical and do not reflect later isolated onboarding, team, banking, ORS and billing work.

# Production Readiness Notes

The current project is a Next.js web app with a polished demo workspace. It is not yet a production backend.

## Implemented In This Repository

- Public website content based on the supplied Word document.
- User workspace routes for dashboard, invoices, suppliers, documents, reports, team, audit and settings.
- Admin control page showing user/security/API readiness.
- POS/manual invoice page with VAT totals and review status.
- PostgreSQL schema draft in `database/001_initial_schema.sql`.
- Environment template in `.env.example`.
- Security headers in `next.config.ts`.

## Still Required For Production

- Real authentication/session system.
- Backend API integration with the existing Android app backend.
- PostgreSQL migration runner/ORM or backend-owned migrations.
- Server-side role checks on every protected operation.
- Private document storage and authorised download route.
- Real OCR/document processing provider.
- Decimal-safe server-side financial calculations.
- Server-generated Excel/PDF exports from persisted authorised data.
- Automated tests for calculations, permissions, uploads, exports and tenant isolation.
- Deployment, monitoring, backups and restore testing.

## Security Position

The frontend must never be treated as the security boundary. Tenant isolation, user management, document access and export permissions must be enforced by the backend and database.

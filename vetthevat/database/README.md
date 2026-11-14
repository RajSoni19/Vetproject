# Vet the VAT Database

Use **PostgreSQL** as the production SQL database. This project currently has demo client-side state; production should move invoices, users, suppliers, documents, audit logs and POS records behind a secured backend API.

## Recommended Architecture

The web admin should connect to the **same backend API used by the existing Android user/admin apps**. Do not build a separate database or duplicate user system unless the existing backend cannot support web access.

Good production flow:

1. Browser signs in through the backend/API.
2. Backend verifies the user, MFA/session and company membership.
3. Backend queries PostgreSQL using a private network connection.
4. PostgreSQL Row Level Security enforces company isolation as an extra guardrail.
5. Documents are served through signed URLs or authorised download endpoints.

## Security Rules

- Never expose `DATABASE_URL` to the browser.
- Use SSL for production database connections.
- Store database in a private network where possible.
- Use least-privilege database users.
- Store password hashes with a strong password hashing function if password auth is owned by Vet the VAT.
- Prefer existing API authentication if the Android apps already have secure login.
- Enforce role checks for Owner, Admin, Finance, Accountant, Staff and Viewer.
- Log admin actions, exports, role changes, invoice edits and document access.
- Back up the database and test restore procedures.

## Local PostgreSQL

If you want a local PostgreSQL server on this Windows machine, it can be installed, but it should be an explicit step because it changes the system.

Options:

- Use a managed PostgreSQL service for production.
- Use Docker PostgreSQL for local development.
- Install PostgreSQL for Windows locally if Docker is not available.

## Applying The Schema

After PostgreSQL is installed and a database exists:

```powershell
psql "$env:DATABASE_URL" -f database/001_initial_schema.sql
```

For production, run migrations through your deployment pipeline rather than manually from a developer laptop.

# Vet the VAT Implementation Plan

## Current Stack

- Next.js 16 App Router.
- React 19 and TypeScript.
- Tailwind CSS.
- Client-side demo state in `components/app-state.tsx`.
- Browser-side Excel/PDF generation through `xlsx` and `jspdf`.
- No real auth, backend API, object storage, OCR provider or PostgreSQL runtime connected yet.

## Highest-Priority Gaps

1. Replace demo/local state with the existing Android backend API or a new shared backend.
2. Add real authentication/session handling and server-side role checks.
3. Move invoice/document persistence to PostgreSQL and private object storage.
4. Add a real OCR/document-processing provider behind the existing adapter pattern.
5. Generate reports and document links from authorised persisted records.
6. Add automated tests for calculations, permissions, upload validation and exports.

## Phase 1: Web Admin And API Readiness

- Keep `/app/admin` as the operational admin entry point.
- Use `lib/api/*` as the only integration boundary for the Android backend.
- Collect API base URL, auth flow, endpoint docs and role model from the Android app team.
- Block production launch until API permissions and document access are verified.

## Phase 2: Data Persistence

- Use PostgreSQL schema in `database/001_initial_schema.sql` as the initial relational model.
- Decide whether migrations live in this web repo or the shared backend repo.
- Keep production secrets in environment variables or a secret manager.
- Run all invoice + line-item + VAT-breakdown writes in one backend transaction.

## Phase 3: Secure Documents

- Store source invoices in private storage, not `public/`.
- Save only storage keys and metadata in PostgreSQL.
- Serve documents through authorised routes or short-lived signed URLs.
- Add file size/type validation and malware scanning where available.

## Phase 4: OCR And Review

- Keep demo extraction clearly labelled until provider credentials exist.
- Add provider-specific OCR adapter only after credentials and target provider are chosen.
- Save processing jobs, extracted fields, confidence values and retry/failure states.
- Require human review before verified accounting/VAT status.

## Phase 5: Quality Gates

- Unit tests for VAT calculation and mixed rates.
- Integration tests for cross-company isolation.
- Upload/review/verify/export end-to-end tests.
- Dependency audit and production build in CI.
- Backup and restore runbook tested before launch.

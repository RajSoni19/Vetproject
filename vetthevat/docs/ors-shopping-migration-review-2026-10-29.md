# ORS shopping workflow migration review package

Status: **review-only; not executed**  
Target: `127.0.0.1:55440/vtv_saas_dev`  
Migration: `database/migrations/saas/031_ors_shopping_cart.review.sql`  
SHA-256: `5e36beeecfd371eec310f30150a9d16ade819ec5b03a4ac5656b4c998125114c`

## Backup and restore evidence

Fresh source backup created from the verified approved database. No migration statement was run.

- Backup directory: `D:\vetthevat.saas-dev\backups\ors-shopping-before-20261028185758484-b95cba28-1a03-4d29-a1e2-275b3c11ffe6`
- `before.dump`: `327f023ac2204e05d53664224c6b3d1466a3a8d5de65de6dd8ec256b79957d95`
- `roles.sql`: `ca1d23f1195e63715c357d064416f96942e2d0a3205863f85b10b8e9b5068f57`
- `archive-list.txt`: `a9c4109ba1674ae70ae0fa7e59bcf54e2ad1d22be7f6afa21d231d55134c2a86`
- Archive listing: verified.
- Restore drill: restored into disposable `vtv_restore_ors_65f2d54ba1`, verified the core schema and ORS/invoice relations, then dropped that disposable database. No application or protected database was changed.
- Backup checksum and restore metadata: `D:\vetthevat.saas-dev\backups\ors-shopping-before-20261028185758484-b95cba28-1a03-4d29-a1e2-275b3c11ffe6\preparation.json`.

## Migration contents

The draft uses the current `operations.materials` records as canonical stock identities and adds company-scoped, forced-RLS structures for reviewed catalogue metadata, explicit order units/conversions, supplier associations, a persistent draft/master requisition, supplier groups, line-level actual purchase results and append-only requisition events. Existing materials are listed as unreviewed/unlisted; only exact EA→pcs and KG→kg base units are seeded. It does not invent product pictures, box sizes, live stock, or supplier quotations.

The draft was updated so cart removals retain lines with a `removed` status for audit, supplier groups begin in `draft`, and requisitions can record required date and internal priority. Actual purchased item quantities do not post stock. The existing `operations.receive_purchase_line` goods receipt function remains the sole stock-posting path.

## Rollback and recovery plan

The migration is a single SQL transaction. Before commit, any SQL error rolls back the transaction. No destructive down migration is supplied: once real cart, assignment or purchasing history exists, dropping the new tables would destroy business records. If an approved migration commits and a material defect is found, stop the local app and preserve the source database and backup. Restore the pre-migration archive into a **new isolated database** for recovery analysis, then prepare a reviewed forward repair or separately approved controlled recovery. Never restore over the source or run an automatic rollback.

## Boundaries

- `migrationExecuted` is false; the approved database still has no `operations.shopping_*` tables.
- Migration SQL has not been run against the source or a disposable database. The restore drill proves backup restorability, not migration execution.
- No production, Firebase, mobile, VPS or protected database was contacted.
- Approval must identify this exact filename and checksum. It does not imply approval of future schema or deployment changes.

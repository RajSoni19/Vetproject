-- 047: Allow an audited soft delete of a CONFIRMED invoice, with a reason.
-- Before: only drafts could be soft-deleted (invoice_soft_delete_draft_only)
-- and check_invoice() refused every update to a confirmed invoice.
-- After: a confirmed invoice may change ONLY deleted_at / deleted_by /
-- delete_reason / version (+1) / updated_at, by a user holding
-- invoices:confirm, with a 3-500 character reason. Every other change to a
-- confirmed invoice is still refused. The revision trigger still records it.
-- Applied by scripts/apply-047-confirmed-delete.cjs (single transaction).

ALTER TABLE business.invoices ADD COLUMN IF NOT EXISTS delete_reason text;
ALTER TABLE business.invoices DROP CONSTRAINT IF EXISTS invoice_soft_delete_draft_only;
ALTER TABLE business.invoices DROP CONSTRAINT IF EXISTS invoice_soft_delete_reason;
ALTER TABLE business.invoices ADD CONSTRAINT invoice_soft_delete_reason CHECK (
  deleted_at IS NULL OR state = 'draft' OR length(btrim(coalesce(delete_reason, ''))) BETWEEN 3 AND 500
);
-- check_invoice() is patched by the runner: it prepends the soft-delete branch
-- below to the existing function body (pg_get_functiondef), keeping all checks.
--
--  IF TG_OP='UPDATE' AND OLD.state='confirmed' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
--    IF NOT business.scope(NEW.company_id,'invoices:confirm') THEN RAISE EXCEPTION 'Invoice capability required'; END IF;
--    IF NEW.version<>OLD.version+1 OR NEW.deleted_by IS NULL
--       OR length(btrim(coalesce(NEW.delete_reason,''))) NOT BETWEEN 3 AND 500
--       OR (to_jsonb(NEW)-ARRAY['deleted_at','deleted_by','delete_reason','version','updated_at'])
--          <> (to_jsonb(OLD)-ARRAY['deleted_at','deleted_by','delete_reason','version','updated_at'])
--    THEN RAISE EXCEPTION 'Only an audited delete with a reason is allowed on a confirmed invoice'; END IF;
--    RETURN NEW;
--  END IF;

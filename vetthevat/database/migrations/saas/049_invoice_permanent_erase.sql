-- 049: Permanent erase of an invoice and everything attached to it.
-- Chosen by the product owner on 2026-11-14 ("Erase everything"): deleted
-- invoices are removed from the database, including their history.
--
-- Immutability protections stay in force for every other row. A delete is
-- allowed only while business.erase_invoice() runs, and only for rows of the
-- one invoice it names (transaction-local setting vtv.erase_invoice).

CREATE OR REPLACE FUNCTION saas.reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'pg_catalog' AS $function$
BEGIN
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('vtv.erase_invoice', true), '') <> ''
     AND to_jsonb(OLD) ->> 'invoice_id' = current_setting('vtv.erase_invoice', true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Immutable history cannot be changed';
END $function$;

CREATE OR REPLACE FUNCTION business.erase_invoice(p_company uuid, p_invoice uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE target business.invoices;
BEGIN
  SELECT * INTO target FROM business.invoices WHERE company_id = p_company AND id = p_invoice FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM business.invoices WHERE company_id = p_company AND credit_for_id = p_invoice) THEN
    RAISE EXCEPTION 'Delete the credit notes for this invoice first' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('vtv.erase_invoice', p_invoice::text, true);
  -- line-level links first, then invoice-level records, then lines, history, invoice.
  DELETE FROM price_intelligence.line_matches WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.source_links           WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM operations.invoice_matches      WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.payment_allocations    WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.bank_allocations       WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.vat_adjustments        WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.review_issues          WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_payment_events WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_payments       WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_tax_review_events WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_tax_reviews    WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_attachments    WHERE company_id = p_company AND invoice_id = p_invoice;
  UPDATE business.extraction_jobs SET invoice_id = NULL WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_usage          WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_lines          WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoice_revisions      WHERE company_id = p_company AND invoice_id = p_invoice;
  DELETE FROM business.invoices               WHERE company_id = p_company AND id = p_invoice;
  PERFORM set_config('vtv.erase_invoice', '', true);
END $function$;
-- Row-level security is FORCED on these tables and they had no DELETE policy,
-- so deletes silently matched nothing. Add erase-scoped DELETE policies: a row
-- is deletable only while erase_invoice() runs for that row's invoice. Rows a
-- company cannot see are still invisible (SELECT policies apply to the lookup).
DO $policies$
DECLARE t text; col text; owner_role text := current_user;
BEGIN
  FOR t, col IN VALUES
    ('price_intelligence.line_matches','invoice_id'),('business.source_links','invoice_id'),('operations.invoice_matches','invoice_id'),
    ('business.payment_allocations','invoice_id'),('business.bank_allocations','invoice_id'),('business.vat_adjustments','invoice_id'),
    ('business.review_issues','invoice_id'),('business.invoice_payment_events','invoice_id'),('business.invoice_payments','invoice_id'),
    ('business.invoice_tax_review_events','invoice_id'),('business.invoice_tax_reviews','invoice_id'),('business.invoice_attachments','invoice_id'),
    ('business.invoice_usage','invoice_id'),('business.invoice_lines','invoice_id'),('business.invoice_revisions','invoice_id'),('business.invoices','id')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS erase_invoice_delete ON %s', t);
    EXECUTE format('CREATE POLICY erase_invoice_delete ON %s FOR DELETE TO %I USING (coalesce(current_setting(''vtv.erase_invoice'', true), '''') <> '''' AND %I::text = current_setting(''vtv.erase_invoice'', true))', t, owner_role, col);
  END LOOP;
  -- extraction_jobs keeps the job but drops the link to the erased invoice.
  EXECUTE format('DROP POLICY IF EXISTS erase_invoice_unlink ON business.extraction_jobs');
  EXECUTE format('CREATE POLICY erase_invoice_unlink ON business.extraction_jobs FOR UPDATE TO %I USING (coalesce(current_setting(''vtv.erase_invoice'', true), '''') <> '''' AND invoice_id::text = current_setting(''vtv.erase_invoice'', true)) WITH CHECK (invoice_id IS NULL)', owner_role);
END $policies$;
-- check_draft_child() (draft-only guard on invoice lines etc.) is patched by the
-- runner to let the same erase-scoped deletes through.

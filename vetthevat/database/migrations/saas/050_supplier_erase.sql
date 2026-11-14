-- 050: Permanent erase of a supplier/customer that nothing references.
-- business.counterparties has FORCED row-level security and no DELETE policy;
-- this adds one that applies only while erase_counterparty() runs for that row.
-- Suppliers still referenced by invoices, orders or prices cannot be erased
-- (the foreign keys refuse it).
DROP POLICY IF EXISTS erase_counterparty_delete ON business.counterparties;
CREATE POLICY erase_counterparty_delete ON business.counterparties FOR DELETE TO CURRENT_USER
  USING (coalesce(current_setting('vtv.erase_counterparty', true), '') <> '' AND id::text = current_setting('vtv.erase_counterparty', true));

CREATE OR REPLACE FUNCTION business.erase_counterparty(p_company uuid, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $function$
DECLARE removed integer;
BEGIN
  PERFORM set_config('vtv.erase_counterparty', p_id::text, true);
  DELETE FROM business.counterparties WHERE company_id = p_company AND id = p_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('vtv.erase_counterparty', '', true);
  IF removed <> 1 THEN RAISE EXCEPTION 'Supplier not found' USING ERRCODE = 'P0002'; END IF;
END $function$;

-- 048: The duplicate-invoice rule (same supplier/customer, direction, kind and
-- invoice number) applies only to invoices that are not deleted, so a deleted
-- invoice can be scanned and saved again. Deleted rows stay in the database
-- for the audit history. The index keeps its name: the app maps a violation of
-- "invoice_duplicate_identity" to the friendly duplicate message.
DROP INDEX IF EXISTS business.invoice_duplicate_identity;
CREATE UNIQUE INDEX invoice_duplicate_identity
  ON business.invoices(company_id, direction, kind, contact_id, number_key)
  WHERE deleted_at IS NULL;

-- 051: Record of every order sent to a supplier from ORS price comparison
-- (WhatsApp or email), so the business keeps an order history and can mark
-- orders as delivered or cancelled. Company-isolated with forced RLS.
CREATE TABLE IF NOT EXISTS business.supplier_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id),
  number text NOT NULL CHECK (number ~ '^PO-[0-9]{4,9}$'),
  supplier_id uuid,
  supplier_name text NOT NULL CHECK (length(trim(supplier_name)) BETWEEN 1 AND 200),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','cancelled')),
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 200),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS supplier_orders_company_created ON business.supplier_orders (company_id, created_at DESC);

ALTER TABLE business.supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.supplier_orders FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON business.supplier_orders TO CURRENT_USER;

DROP POLICY IF EXISTS supplier_order_read ON business.supplier_orders;
CREATE POLICY supplier_order_read ON business.supplier_orders FOR SELECT TO CURRENT_USER
  USING (saas.authorized_company(company_id, 'reports:read'));
DROP POLICY IF EXISTS supplier_order_insert ON business.supplier_orders;
CREATE POLICY supplier_order_insert ON business.supplier_orders FOR INSERT TO CURRENT_USER
  WITH CHECK (business.scope(company_id, 'invoices:write'));
DROP POLICY IF EXISTS supplier_order_update ON business.supplier_orders;
CREATE POLICY supplier_order_update ON business.supplier_orders FOR UPDATE TO CURRENT_USER
  USING (business.scope(company_id, 'invoices:write')) WITH CHECK (business.scope(company_id, 'invoices:write'));

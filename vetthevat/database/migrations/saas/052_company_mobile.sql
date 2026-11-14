-- 052: The business's own mobile number (WhatsApp). It is added to the order
-- message so suppliers know where to reply. Company-isolated with forced RLS.
CREATE TABLE IF NOT EXISTS business.company_contacts (
  company_id uuid PRIMARY KEY REFERENCES web_auth.companies(id),
  phone text NOT NULL CHECK (phone ~ '^\+[0-9]{8,15}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE business.company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE business.company_contacts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON business.company_contacts TO CURRENT_USER;

DROP POLICY IF EXISTS company_contact_read ON business.company_contacts;
CREATE POLICY company_contact_read ON business.company_contacts FOR SELECT TO CURRENT_USER
  USING (saas.authorized_company(company_id, 'contacts:read'));
DROP POLICY IF EXISTS company_contact_insert ON business.company_contacts;
CREATE POLICY company_contact_insert ON business.company_contacts FOR INSERT TO CURRENT_USER
  WITH CHECK (business.scope(company_id, 'contacts:write'));
DROP POLICY IF EXISTS company_contact_update ON business.company_contacts;
CREATE POLICY company_contact_update ON business.company_contacts FOR UPDATE TO CURRENT_USER
  USING (business.scope(company_id, 'contacts:write')) WITH CHECK (business.scope(company_id, 'contacts:write'));

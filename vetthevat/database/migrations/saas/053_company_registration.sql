-- 053: The business's registered office address and Companies House number,
-- entered during company setup. Both optional (sole traders have no number).
ALTER TABLE business.company_contacts ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE business.company_contacts ADD COLUMN IF NOT EXISTS company_number text
  CHECK (company_number IS NULL OR company_number ~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$');
ALTER TABLE business.company_contacts ADD COLUMN IF NOT EXISTS registered_address text
  CHECK (registered_address IS NULL OR length(registered_address) BETWEEN 1 AND 500);

-- REVIEW ONLY: no grants/writes/authentication implied. Must test real roles.
-- Assumes candidate 001 only; not compatible with the old public-schema draft.
BEGIN;
ALTER TABLE vat.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat.app_users FORCE ROW LEVEL SECURITY;
CREATE POLICY own_user_read ON vat.app_users FOR SELECT
 USING(id = nullif(current_setting('app.user_id',true),'')::uuid AND status='active');
ALTER TABLE vat.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat.company_members FORCE ROW LEVEL SECURITY;
CREATE POLICY own_membership_read ON vat.company_members FOR SELECT
 USING(user_id=nullif(current_setting('app.user_id',true),'')::uuid AND status='Active'
 AND company_id=nullif(current_setting('app.company_id',true),'')::uuid);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['companies','suppliers','supplier_aliases','documents','invoices',
 'invoice_lines','invoice_vat_groups','invoice_warnings','bank_accounts','bank_imports',
 'bank_transactions','bank_allocations','audit_events','invoice_revisions','idempotency_keys','legacy_mappings']
 LOOP
  EXECUTE format('ALTER TABLE vat.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE vat.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY member_read ON vat.%I FOR SELECT USING (%I = nullif(current_setting(''app.company_id'',true),'''')::uuid AND EXISTS (SELECT 1 FROM vat.company_members m JOIN vat.app_users u ON u.id=m.user_id WHERE m.company_id=nullif(current_setting(''app.company_id'',true),'''')::uuid AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')::uuid AND m.status=''Active''))',t,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END);
 END LOOP;
 -- These are privileged identity/session tables: no runtime policies or grants.
 ALTER TABLE vat.identities ENABLE ROW LEVEL SECURITY;
 ALTER TABLE vat.identities FORCE ROW LEVEL SECURITY;
 ALTER TABLE vat.web_sessions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE vat.web_sessions FORCE ROW LEVEL SECURITY;
END $$;
COMMIT;
-- No runtime GRANTs here. Column/DTO minimization and permission-specific reads
-- (e.g. audit, originals, exports) must be reviewed before granting SELECT.
-- Writes are deny-by-default: no INSERT/UPDATE/DELETE policies provided yet.
-- Context GUCs can be forged by someone holding runtime credentials: mandatory
-- server-side Firebase verification, membership and capability checks precede SQL.

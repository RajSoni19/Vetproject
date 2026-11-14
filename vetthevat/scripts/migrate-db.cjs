const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Read .env.local
const envFile = path.resolve(__dirname, '../.env.local');
const env = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > -1) {
      const k = trimmed.slice(0, idx).trim();
      let v = trimmed.slice(idx + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      env[k] = v;
    }
  }
}

const dbUrl = env.DATABASE_URL || env.WEB_AUTH_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('Error: No DATABASE_URL found in .env.local');
  process.exit(1);
}

console.log('Connecting to database:', dbUrl.replace(/:[^:@]*@/, ':***@'));

const sqlScript = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS web_auth;
CREATE SCHEMA IF NOT EXISTS web_business;

CREATE TABLE IF NOT EXISTS web_auth.installation (
  id uuid PRIMARY KEY,
  version integer NOT NULL UNIQUE,
  installed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO web_auth.installation(id, version)
VALUES ('00000000-0000-4000-8000-000000000001', 1)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS web_auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  preferred_locale text DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL
);

INSERT INTO web_auth.roles(name, description) VALUES
  ('software_administrator', 'System administrator'),
  ('Owner', 'Account owner'),
  ('Admin', 'Administrator'),
  ('Finance', 'Finance manager'),
  ('Member', 'Team member')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS web_auth.user_roles (
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES web_auth.roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS web_auth.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES web_auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.company_memberships (
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Owner',
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS web_auth.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  company_id uuid,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_auth.rate_limits (
  key char(64) PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS web_auth.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES web_auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ciphertext text NOT NULL,
  iv char(24) NOT NULL,
  tag char(32) NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_business.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  vat_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_business.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  vat_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_business.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  original_name text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_business.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'GBP',
  net_amount numeric(18,2) NOT NULL DEFAULT 0,
  vat_amount numeric(18,2) NOT NULL DEFAULT 0,
  gross_amount numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_business.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES web_auth.companies(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION web_auth.update_profile(session_hash text, new_full_name text)
RETURNS TABLE(full_name text, email text, email_verified_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior_name text;
BEGIN
 IF session_hash !~ '^[a-f0-9]{64}$'
 OR new_full_name IS NULL
 OR new_full_name<>btrim(regexp_replace(new_full_name,'\\s+',' ','g'))
 OR length(new_full_name)<1 OR length(new_full_name)>120
 OR new_full_name ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid profile update'; END IF;
 SELECT s.user_id,u.full_name INTO actor,prior_name
 FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id
 WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>now()
 AND u.status='active' AND u.email_verified_at IS NOT NULL FOR UPDATE OF s,u;
 IF actor IS NULL THEN RAISE EXCEPTION 'Active verified session required'; END IF;
 UPDATE web_auth.users u SET full_name=new_full_name
 WHERE u.id=actor AND u.status='active'
 RETURNING u.full_name,u.email,u.email_verified_at INTO full_name,email,email_verified_at;
 IF full_name IS NULL THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF prior_name IS DISTINCT FROM full_name THEN
  INSERT INTO web_auth.audit_logs(actor_user_id,action,metadata)
  VALUES(actor,'auth.profile.updated',jsonb_build_object('field','full_name'));
 END IF;
 RETURN NEXT;
END $$;

`;

async function main() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: env.WEB_AUTH_DATABASE_TLS === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log('Connected successfully to PostgreSQL!');
    console.log('Applying database schemas and migrations...');
    await client.query(sqlScript);
    console.log('✅ Migrations applied successfully! web_auth and web_business tables are ready.');
    await client.end();
  } catch (err) {
    console.error('❌ Connection or Migration Error:');
    console.error(err.message);
    if (err.message.includes('pg_hba.conf')) {
      console.error('\nNOTE: The PostgreSQL server rejected the connection because pg_hba.conf does not whitelist your client IP.');
      console.error('Please configure pg_hba.conf on 194.62.248.68 to allow connections.');
    }
    process.exit(1);
  }
}

main();

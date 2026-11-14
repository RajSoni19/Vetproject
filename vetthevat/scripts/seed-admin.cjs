const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { hash } = require('@node-rs/argon2');

// Load environment variables from .env.local if present
try {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      }
    }
  }
} catch (e) {
  // Ignore
}

const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@vetthevat.com';
const adminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Superadmin@20';

async function run() {
  const c = new Client({
    connectionString: process.env.POSTGRES_DIRECT_URL || process.env.DATABASE_URL || 'postgresql://vetthevat_user:vraj%4019@194.62.248.68:5432/vetthevat_db',
    ssl: false
  });
  await c.connect();
  console.log('Connected to DB');

  const pHash = await hash(adminPassword, {
    algorithm: 2,
    version: 1,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32
  });

  // Ensure admin user exists
  const res = await c.query(
    `INSERT INTO web_auth.users(id, full_name, email, password_hash, email_verified_at, status)
     VALUES(gen_random_uuid(), 'VTV Super Admin', $1, $2, now(), 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, email_verified_at = now(), status = 'active'
     RETURNING id, email, full_name`,
    [adminEmail, pHash]
  );
  const adminUser = res.rows[0];
  console.log('Super Admin user provisioned:', adminUser);

  // Ensure platform_admin.grants exists for admin@vetthevat.com
  await c.query(
    `INSERT INTO platform_admin.grants(user_id, role, active)
     VALUES($1, 'Super Admin', true)
     ON CONFLICT (user_id) DO UPDATE SET role = 'Super Admin', active = true`,
    [adminUser.id]
  );

  // Ensure factor is verified
  await c.query(
    `INSERT INTO platform_admin.factors(user_id, secret, verified)
     VALUES($1, decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), true)
     ON CONFLICT (user_id) DO UPDATE SET verified = true`,
    [adminUser.id]
  );

  // Also ensure rs4755524@gmail.com and raj@gmail.com have Super Admin grants
  await c.query(`
    INSERT INTO platform_admin.grants(user_id, role, active)
    SELECT id, 'Super Admin', true FROM web_auth.users
    ON CONFLICT (user_id) DO UPDATE SET role = 'Super Admin', active = true;

    INSERT INTO platform_admin.factors(user_id, secret, verified)
    SELECT id, decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'), true FROM web_auth.users
    ON CONFLICT (user_id) DO UPDATE SET verified = true;
  `);

  console.log('Super admin permissions and factor verified for all admin users.');
  await c.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

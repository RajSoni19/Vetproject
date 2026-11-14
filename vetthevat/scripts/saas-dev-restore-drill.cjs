// Restore an already verified pre-approval custom archive to a uniquely named
// disposable database on the isolated 55440 development cluster, then drop it.
const s = require('./saas-dev-common.cjs');
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

async function main() {
  const config = s.configuration();
  const backup = path.resolve(process.argv[2] || '');
  const expectedRoot = path.resolve(s.directory, 'backups');
  if (!backup.startsWith(expectedRoot + path.sep) || s.fs.realpathSync(backup).toLowerCase() !== backup.toLowerCase()) throw Error('Backup path must resolve inside the isolated backup directory');
  const sums = JSON.parse(s.fs.readFileSync(path.join(backup, 'checksums.json'), 'utf8'));
  for (const [name, hash] of Object.entries(sums)) {
    if (!['before.dump', 'roles.sql', 'archive-list.txt'].includes(name) || s.crypto.createHash('sha256').update(s.fs.readFileSync(path.join(backup, name))).digest('hex') !== hash) throw Error('Backup checksum mismatch');
  }
  const dbName = `vtv_trial_restore_${Date.now()}_${s.crypto.randomBytes(3).toString('hex')}`;
  if (!/^vtv_trial_restore_[a-z0-9_]+$/.test(dbName)) throw Error('Disposable database name invalid');
  const admin = new Client({ ...s.connection('vtv_saas_operator'), database: 'postgres' });
  let created = false, restored = false;
  try {
    await admin.connect();
    const live = await admin.query("SELECT current_database() AS db, host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS role");
    const x = live.rows[0];
    if (x.db !== 'postgres' || x.host !== '127.0.0.1' || x.port !== 55440 || x.role !== 'vtv_saas_operator') throw Error('Restore target cluster identity mismatch');
    await admin.query(`CREATE DATABASE "${dbName}"`); created = true;
    const env = { ...process.env, PGPASSWORD: config.operatorPassword, PGHOSTADDR: '127.0.0.1', PGSSLMODE: 'disable' };
    for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGDATABASE', 'PGUSER', 'PGHOST', 'PGPORT', 'PGPASSFILE']) delete env[key];
    const bin = 'C:/Program Files/PostgreSQL/17/bin/';
    execFileSync(bin + 'pg_restore.exe', ['-h', '127.0.0.1', '-p', '55440', '-U', 'vtv_saas_operator', '--no-password', '--exit-on-error', '-d', dbName, path.join(backup, 'before.dump')], { env, stdio: 'ignore', windowsHide: true });
    restored = true;
    const check = await new Client({ ...s.connection('vtv_saas_operator'), database: dbName });
    await check.connect();
    try {
      const result = await check.query(`SELECT current_database() AS db,
        (SELECT count(*)::int FROM pg_namespace WHERE nspname IN ('saas','operations','invoices','price_intelligence','analytics')) AS schemas,
        to_regclass('saas.schema_version') IS NOT NULL AS version_present,
        to_regclass('saas.trial_history') IS NULL AS migration_absent,
        (SELECT relforcerowsecurity FROM pg_class WHERE oid='operations.purchase_requests'::regclass) AS rls_forced`);
      const v = result.rows[0];
      if (v.db !== dbName || v.schemas !== 3 || !v.version_present || !v.migration_absent || v.rls_forced !== true) throw Error(`Restored disposable database structural checks failed (${JSON.stringify(v)})`);
    } finally { await check.end(); }
  } finally {
    if (created) {
      try { await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`); }
      catch (e) { await admin.end(); throw Error(`Restore drill left disposable database ${dbName}: ${e.code || e.message}`); }
    }
    await admin.end();
  }
  console.log(JSON.stringify({ targetCluster: '127.0.0.1:55440', sourceDatabase: 'vtv_saas_dev', disposableDatabase: dbName, backupChecksumsVerified: true, archiveRestored: restored, structuralChecks: restored ? 'PASS' : 'FAIL', disposableDatabaseDropped: true, migrationExecuted: false }, null, 2));
}
main().catch(e => { console.error('Disposable restore drill failed:', e.code || e.message); process.exitCode = 1; });

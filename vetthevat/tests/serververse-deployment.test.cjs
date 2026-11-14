const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

const read=path=>fs.readFileSync(path,'utf8');

test('ServerVerse PostgreSQL template is TLS-only and loopback-bound',()=>{
 const config=read('deploy/postgres/serververse/postgresql.conf.template'),hba=read('deploy/postgres/serververse/pg_hba.conf.template');
 assert.match(config,/^listen_addresses\s*=\s*'127\.0\.0\.1'$/m);
 assert.match(config,/^port\s*=\s*<approved-unused-loopback-port>$/m);
 assert.match(config,/^ssl\s*=\s*on$/m);
 assert.match(config,/^ssl_min_protocol_version\s*=\s*'TLSv1\.2'$/m);
 assert.match(config,/^password_encryption\s*=\s*'scram-sha-256'$/m);
 assert.match(hba,/^hostssl\s+vtv_saas_production\s+vtv_saas_runtime\s+127\.0\.0\.1\/32\s+scram-sha-256$/m);
 assert.match(hba,/^host\s+all\s+all\s+0\.0\.0\.0\/0\s+reject$/m);
 assert.match(hba,/^host\s+all\s+all\s+::\/0\s+reject$/m);
 assert.doesNotMatch(hba,/^host\s+all\s+all\s+(?:0\.0\.0\.0\/0|::\/0)\s+(?:scram-sha-256|md5|trust)$/m);
});

test('production PostgreSQL URLs are loopback-only, pinned to an approved port and TLS CA',()=>{
 for(const name of ['web','inspect','extract','mail','contact','stripe','backup','restore']){
  const env=read(`deploy/environments/production/${name}.env.template`);
  assert.match(env,/VTV_DATABASE_PROVIDER=serververse/);
  assert.match(env,/VTV_DATABASE_HOST=127\.0\.0\.1|PGHOST=127\.0\.0\.1/);
  assert.match(env,/VTV_DATABASE_PORT=<approved-unused-loopback-port>|PGPORT=<approved-unused-loopback-port>/);
  assert.match(env,/VTV_APPROVED_DATABASE_HOST=127\.0\.0\.1/);
  assert.match(env,/PGSSLROOTCERT=\/etc\/vetthevat\/production\/postgres-ca\.pem|VTV_DATABASE_CA_FILE=\/etc\/vetthevat\/production\/postgres-ca\.pem/);
  assert.doesNotMatch(env,/managed-production-postgres|neon\.tech|app\.vetthevat\.com/);
 }
});

test('only the isolated backup identity can bypass RLS; application roles remain least-privilege',()=>{
 const roles=read('deploy/postgres/roles.sql.template');
 for(const role of ['vtv_web_runtime','vtv_saas_runtime','vtv_saas_document_worker','vtv_saas_provider_runtime','vtv_contact_runtime','vtv_contact_worker']){
  assert.match(roles,new RegExp(`CREATE ROLE ${role} LOGIN[^;]*NOBYPASSRLS;`));
 }
 assert.match(roles,/CREATE ROLE vtv_backup_operator LOGIN[^;]*BYPASSRLS;/);
 assert.doesNotMatch(roles,/GRANT\s+pg_read_all_data\b/i);
 assert.doesNotMatch(roles,/GRANT\s+(?:vtv_web_owner|vtv_saas_owner|vtv_saas_database_owner)\s+TO\s+(?:vtv_web_runtime|vtv_saas_runtime|vtv_saas_document_worker|vtv_saas_provider_runtime|vtv_contact_runtime|vtv_contact_worker)\b/i);
});

test('backup and restore runners require verified TLS and exact, non-development targets',()=>{
 const backup=read('deploy/ubuntu/backup.sh'),restore=read('deploy/ubuntu/restore-drill.sh');
 assert.match(backup,/PGDATABASE:-\} == "vtv_saas_\$profile"/);
 assert.match(backup,/PGSSLMODE:-\} == verify-full/);
 assert.match(backup,/VTV_DATABASE_PROVIDER:-\} in/);
 assert.match(backup,/VTV_SERVERVERSE_DATABASE_APPROVED/);
 assert.match(backup,/age -r/);
 assert.match(backup,/rclone check/);
 assert.match(restore,/^\[\[ \$\{PGDATABASE:-\} =~ \^vtv_restore_drill_/m);
 assert.match(restore,/PGSSLMODE:-\} == verify-full/);
 assert.match(restore,/VTV_RESTORE_APPROVED_TARGET/);
 assert.match(restore,/PGUSER:-\} == vtv_restore_operator/);
 assert.match(restore,/--single-transaction/);
 assert.match(restore,/55439/);
 assert.match(restore,/55440/);
});

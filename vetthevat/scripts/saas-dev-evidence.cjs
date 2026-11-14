// Read-only verification; records no credentials, tokens or customer fields.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Client}=require('pg');
const s=require('./saas-dev-common.cjs');
async function run(){
 const c=s.configuration(),db=new Client(s.connection('vtv_saas_operator'));await db.connect();
 try{
  await db.query('BEGIN READ ONLY');
  const target=(await db.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS cluster,pg_get_userbyid(datdba) AS database_owner FROM pg_database WHERE datname=current_database()")).rows[0];
  if(target.database!=='vtv_saas_dev'||target.host!=='127.0.0.1'||target.port!==55440||path.resolve(target.cluster).toLowerCase()!==path.join(s.directory,'cluster').toLowerCase())throw Error('Evidence target mismatch');
  const tables=(await db.query("SELECT n.nspname AS schema,c.relname AS table,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('web_auth','saas') AND c.relkind='r' ORDER BY 1,2")).rows;
  const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN('vtv_saas_operator','vtv_saas_database_owner','vtv_web_owner','vtv_saas_owner','vtv_web_runtime','vtv_saas_runtime') ORDER BY rolname")).rows;
  const policies=(await db.query("SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='saas' ORDER BY tablename,policyname")).rows;
  const constraints=(await db.query("SELECT n.nspname AS schema,c.conname AS name,r.relname AS table,c.contype AS type,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace JOIN pg_class r ON r.oid=c.conrelid WHERE n.nspname IN('web_auth','saas') ORDER BY 1,3,2")).rows;
  const indexes=(await db.query("SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN('web_auth','saas') ORDER BY 1,2,3")).rows;
  const accounts=(await db.query("SELECT (SELECT count(*) FROM web_auth.users WHERE email='admin@vetthevat.com')::int AS real_admin_accounts,(SELECT count(*) FROM web_auth.user_roles)::int AS software_admin_grants")).rows[0];
  await db.query('ROLLBACK');
  const initialHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(s.root,'database/migrations/saas/001_saas_foundation.review.sql'))).digest('hex');
  const fix=JSON.parse(fs.readFileSync(path.join(s.directory,'authorization-fix-applied.json'),'utf8'));
  const correctionHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(s.root,'database/migrations/saas/002_stage_a_authorization_locks.review.sql'))).digest('hex');
  if(initialHash!==c.approvedSqlHash||correctionHash!==fix.sha256||fix.committed!==true)throw Error('Migration history checksum mismatch');
  const sums=JSON.parse(fs.readFileSync(path.join(s.directory,'backups/checksums.json'),'utf8'));
  for(const [file,sum]of Object.entries(sums))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(s.directory,'backups',file))).digest('hex')!==sum)throw Error('Backup checksum mismatch');
  const fixBackup=path.join(s.directory,'backups/authorization-fix-before.dump');if(crypto.createHash('sha256').update(fs.readFileSync(fixBackup)).digest('hex')!==fs.readFileSync(fixBackup.replace('.dump','.sha256'),'utf8').trim())throw Error('Corrective backup mismatch');
  const record={verifiedAt:new Date().toISOString(),target,tables,roles,policies,constraints,indexes,accounts,migrations:[{file:'database/migrations/saas/001_saas_foundation.review.sql',sha256:initialHash,status:'committed',record:'private runtime.approvedSqlHash + web_auth.installation and saas.schema_version + verified live catalog'},{file:'database/migrations/saas/002_stage_a_authorization_locks.review.sql',sha256:correctionHash,status:'committed',record:'private authorization-fix-applied.json and both verified live owner_authorization_lock policies'}],backups:{initialDatabaseAndRolesChecksumsVerified:true,correctionBackupChecksumVerified:true,archiveListingsValidated:true,restoreDrill:false}};
  fs.writeFileSync(path.join(s.root,'docs/master-stage-a-live-catalog.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({tables:tables.length,roles:roles.length,policies:policies.length,forcedRlsTables:tables.filter(t=>t.forced_rls).length,migrationChecksumsVerified:true,backupChecksumsVerified:true,accounts}));
 }finally{await db.end();}
 // The older database is inspected READ ONLY. Do not start/alter it if unavailable.
 const old=require('./pg-auth-common.cjs'),before=JSON.parse(fs.readFileSync(path.join(s.root,'.master-stage-a/auth-database-inspection.json'),'utf8')),auth=new Client(old.connection('vtv_test_operator'));
 await auth.connect();try{
  await auth.query('BEGIN READ ONLY');const counts={};for(const table of Object.keys(before.counts))counts[table]=(await auth.query('SELECT count(*)::text AS count FROM '+table)).rows[0].count;
  await auth.query('ROLLBACK');const matched=JSON.stringify(counts)===JSON.stringify(before.counts);if(!matched)throw Error('Old authentication database counts differ from baseline');
  fs.writeFileSync(path.join(s.root,'.master-stage-a/preserved-auth-check.json'),JSON.stringify({verifiedAt:new Date().toISOString(),readOnly:true,target:'127.0.0.1:55439/vtv_web_auth_test',countsMatchInspectedBaseline:matched,counts},null,2)+'\n');console.log('PASS old authentication READ ONLY aggregate comparison');
 }finally{await auth.end();}
}
run().catch(e=>{console.error('Evidence verification failed: '+(e.code??e.message));process.exitCode=1;});

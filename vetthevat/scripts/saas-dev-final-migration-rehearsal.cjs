// Rehearses exact migration 029 against a disposable restore. This script
// never changes vtv_saas_dev and always drops its disposable database.
const s=require('./saas-dev-common.cjs');
const {Client}=require('pg');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const expectedMigration='9c45378a2251cb8cd5971a4138ac70f06274b78581091d1eb86e5ba6e42e1288';
const bin='C:/Program Files/PostgreSQL/17/bin/';
async function main(){
 const config=s.configuration();
 const backup=path.resolve(process.argv[2]||'');
 const backupRoot=path.resolve(s.directory,'backups');
 const migration=path.join(s.root,'database/migrations/saas/029_automatic_14_day_trial.review.sql');
 if(!backup.startsWith(backupRoot+path.sep)||s.fs.realpathSync(backup).toLowerCase()!==backup.toLowerCase())throw Error('Backup path outside approved isolated backup directory');
 const hashes=JSON.parse(s.fs.readFileSync(path.join(backup,'checksums.json'),'utf8'));
 for(const [name,hash] of Object.entries(hashes)) if(!['before.dump','roles.sql','archive-list.txt'].includes(name)||s.crypto.createHash('sha256').update(s.fs.readFileSync(path.join(backup,name))).digest('hex')!==hash)throw Error('Verified backup checksum mismatch');
 const migrationHash=s.crypto.createHash('sha256').update(s.fs.readFileSync(migration)).digest('hex');
 if(migrationHash!==expectedMigration)throw Error('Exact reviewed migration checksum mismatch');
 const env={...process.env,PGPASSWORD:config.operatorPassword,PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable'};
 for(const key of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGDATABASE','PGUSER','PGHOST','PGPORT','PGPASSFILE'])delete env[key];
 const dbName=`vtv_trial_rehearsal_${Date.now()}_${s.crypto.randomBytes(3).toString('hex')}`;
 let created=false,applyError=null,trialTableAbsent=false,trialColumnsAbsent=false,rlsForced=false;
 const admin=new Client({...s.connection('vtv_saas_operator'),database:'postgres'});
 try{
  await admin.connect();
  const cluster=(await admin.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_user role")).rows[0];
  if(cluster.db!=='postgres'||cluster.host!=='127.0.0.1'||cluster.port!==55440||cluster.role!=='vtv_saas_operator')throw Error('Disposable target cluster identity mismatch');
  await admin.query(`CREATE DATABASE "${dbName}"`);created=true;
  execFileSync(bin+'pg_restore.exe',['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password','--exit-on-error','-d',dbName,path.join(backup,'before.dump')],{env,stdio:'ignore',windowsHide:true});
  try{execFileSync(bin+'psql.exe',['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password','-v','ON_ERROR_STOP=1','-d',dbName,'-f',migration],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});}
  catch(e){applyError=String(e.stderr||e.message).slice(-1800);}
  const check=new Client({...s.connection('vtv_saas_operator'),database:dbName});await check.connect();
  try{const row=(await check.query(`SELECT current_database() db,to_regclass('saas.trial_history') IS NULL trial_table_absent,
    NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='subscription_entitlements' AND column_name IN('trial_started_at','trial_expires_at','trial_status')) trial_columns_absent,
    (SELECT relforcerowsecurity FROM pg_class WHERE oid='operations.purchase_requests'::regclass) rls_forced`)).rows[0];
   if(row.db!==dbName)throw Error('Disposable database identity changed');trialTableAbsent=row.trial_table_absent;trialColumnsAbsent=row.trial_columns_absent;rlsForced=row.rls_forced===true;
  }finally{await check.end();}
  if(!applyError||!trialTableAbsent||!trialColumnsAbsent||!rlsForced)throw Error('Expected target guard refusal or disposable invariants failed');
 }finally{
  if(created)await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
 }
 console.log(JSON.stringify({cluster:'127.0.0.1:55440',disposableDatabase:dbName,backupChecksumsVerified:true,migrationSha256:migrationHash,exactMigrationAttempted:true,guardRefusedAsExpected:true,trialObjectsAbsentAfterAttempt:trialTableAbsent&&trialColumnsAbsent,existingRlsPreserved:rlsForced,disposableDatabaseDropped:true,liveDatabaseModified:false,sqlError:applyError},null,2));
}
main().catch(e=>{console.error('Disposable migration rehearsal failed:',e.code||e.message);process.exitCode=1;});

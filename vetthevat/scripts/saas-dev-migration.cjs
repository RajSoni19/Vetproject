// Default is preview. Execution requires a separately approved exact SQL hash.
// No other database/cluster can be selected through arguments or environment.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.resolve('D:/vetthevat.saas-dev'),cluster=path.join(directory,'cluster');
const migration=path.join(root,'database/migrations/saas/001_saas_foundation.review.sql');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'database/migrations/saas/stage-a.manifest.json'),'utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(migration)).digest('hex');
function assertFreshState(target=directory){if(fs.existsSync(target))throw Error('Refusing any existing .saas-dev state; operator review required.');}
async function run(){
 if(hash!==manifest.sha256)throw Error('Review manifest is stale.');
 if(!process.argv.includes('--apply-approved-new-cluster')){console.log(JSON.stringify({...manifest,execution:'NOT EXECUTED; preview performs no database connection or writes'},null,2));return;}
 if(root.toLowerCase()!==path.resolve('D:/vetthevat').toLowerCase()||process.env.VERCEL!==undefined||process.env.SAAS_MIGRATION_APPROVAL!==hash)throw Error('Explicit approval of the exact SQL checksum is required.');
 assertFreshState();
 const bin='C:/Program Files/PostgreSQL/17/bin';
 if(!execFileSync(path.join(bin,'postgres.exe'),['--version'],{encoding:'utf8',windowsHide:true}).includes(' 17.'))throw Error('PostgreSQL 17 required.');
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:55440});socket.once('connect',()=>{socket.destroy();reject(Error('New test port is occupied.'));});socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(Error('Could not verify test port.')));});
 fs.mkdirSync(directory,{mode:0o700});
 if(fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase())throw Error('Redirected state path refused.');
 execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/saas-dev-permissions.ps1')],{stdio:'ignore',windowsHide:true});
 const operatorPassword=crypto.randomBytes(32).toString('hex'),authPassword=crypto.randomBytes(32).toString('hex'),businessPassword=crypto.randomBytes(32).toString('hex');
 // Persist private bootstrap recovery material before starting any daemon. This
 // is a database service secret, never a customer/account password.
 fs.writeFileSync(path.join(directory,'bootstrap.json'),JSON.stringify({host:'127.0.0.1',port:55440,database:'vtv_saas_dev',operator:'vtv_saas_operator',operatorPassword,authPassword,businessPassword,approvedSqlHash:hash}),{flag:'wx',mode:0o600});
 const passwordFile=path.join(directory,'init-password');fs.writeFileSync(passwordFile,operatorPassword,{flag:'wx',mode:0o600});
 try{execFileSync(path.join(bin,'initdb.exe'),['-D',cluster,'-U','vtv_saas_operator','--pwfile='+passwordFile,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--locale=C','--encoding=UTF8'],{stdio:'ignore',windowsHide:true});}finally{fs.unlinkSync(passwordFile);}
 execFileSync(path.join(bin,'pg_ctl.exe'),['-D',cluster,'-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55440 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse','-w','start'],{stdio:'ignore',windowsHide:true});
 const {Client}=require('pg'),base={host:'127.0.0.1',port:55440,user:'vtv_saas_operator',password:operatorPassword,ssl:false,connectionTimeoutMillis:5000};
 const system=new Client({...base,database:'postgres'});await system.connect();try{
  const identity=(await system.query('SELECT current_user AS role,inet_server_port() AS port')).rows[0];if(identity.role!=='vtv_saas_operator'||identity.port!==55440)throw Error('New cluster identity mismatch.');
  await system.query('CREATE ROLE vtv_saas_database_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await system.query('CREATE DATABASE vtv_saas_dev OWNER vtv_saas_database_owner');
 }finally{await system.end();}
 const backup=path.join(directory,'backups');fs.mkdirSync(backup,{mode:0o700});
 const childEnv={...process.env,PGPASSWORD:operatorPassword,PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable'};
 delete childEnv.PGSERVICE;delete childEnv.PGSERVICEFILE;delete childEnv.PGOPTIONS;
 execFileSync(path.join(bin,'pg_dump.exe'),['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password','-Fc','-f',path.join(backup,'stage-a-before.dump'),'vtv_saas_dev'],{env:childEnv,stdio:'ignore',windowsHide:true});
 execFileSync(path.join(bin,'pg_dumpall.exe'),['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password','--globals-only','-f',path.join(backup,'stage-a-before-roles.sql')],{env:childEnv,stdio:'ignore',windowsHide:true});
 execFileSync(path.join(bin,'pg_restore.exe'),['--list',path.join(backup,'stage-a-before.dump')],{stdio:'ignore',windowsHide:true});
 fs.writeFileSync(path.join(backup,'checksums.json'),JSON.stringify(Object.fromEntries(['stage-a-before.dump','stage-a-before-roles.sql'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(backup,name))).digest('hex')])),null,2),{flag:'wx',mode:0o600});
 const db=new Client({...base,database:'vtv_saas_dev'});await db.connect();try{
  await db.query(fs.readFileSync(migration,'utf8'));
  // Hex strings are freshly generated, never caller input; SQL is never logged.
  await db.query(`ALTER ROLE vtv_web_runtime PASSWORD '${authPassword}'`);
  await db.query(`ALTER ROLE vtv_saas_runtime PASSWORD '${businessPassword}'`);
  const authInstallationId=(await db.query('SELECT id::text FROM web_auth.installation')).rows[0].id;
  const installationId=(await db.query('SELECT installation_id::text FROM saas.schema_version WHERE version=1')).rows[0].installation_id;
  fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify({version:1,host:'127.0.0.1',port:55440,database:'vtv_saas_dev',operatorPassword,authPassword,businessPassword,authInstallationId,installationId,csrfSecret:crypto.randomBytes(32).toString('hex'),outboxKey:crypto.randomBytes(32).toString('hex'),approvedSqlHash:hash}),{flag:'wx',mode:0o600});
 }catch(error){try{await db.query('ROLLBACK');}catch{}throw error;}finally{await db.end();}
 console.log('Approved Stage A migration applied ONLY to NEW 127.0.0.1:55440/vtv_saas_dev. No users, companies or subscriptions created.');
}
if(require.main===module)run().catch(error=>{console.error('Stage A migration refused/failed: '+(error.code??error.message));console.error('No automatic drop/delete/retry. Preserve any new local state for operator review.');process.exitCode=1;});
module.exports={assertFreshState};

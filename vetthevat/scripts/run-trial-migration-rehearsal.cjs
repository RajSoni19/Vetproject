// End-to-end migration 029 rehearsal on a separate, temporary PostgreSQL 17
// cluster. The runner has no connection path to the approved 55440 database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {Client}=require('pg');
const common=require('./saas-dev-common.cjs');
const {loadSource}=require('../tests/load-source.cjs');
const pgBin='C:/Program Files/PostgreSQL/17/bin/';
const root=path.resolve(common.root,'.trial-029-rehearsal');
const cluster=path.join(root,'cluster');
const port=55441,dbName='vtv_saas_dev';
const backup=path.resolve(process.argv[2]||'');
const backupRoot=path.resolve(common.directory,'backups');
const expectedForwardHash='cd6e368612204fa47dcceeb252cd4ed3913795434b17ec49caab93e0339a2d47';
const expectedRollbackHash='4215c4cd5979ff3f31e50bcd579c9372af02ea1ff2032e38b2c10a775c44fcdf';
const generatedMarker=crypto.randomBytes(32).toString('hex');
let serverStarted=false,rootCreated=false;
const results=[];
const ok=(name,extra={})=>{results.push({name,result:'PASS',...extra});console.log('PASS '+name);};
function check(condition,message){if(!condition)throw Error(message);}
function run(exe,args,env,stdio='pipe'){
 try{return execFileSync(pgBin+exe,args,{env,stdio,windowsHide:true,maxBuffer:4*1024*1024,timeout:90000});}
 catch(e){const diagnostic=String(e.stderr?.toString?.()||e.stdout?.toString?.()||e.message||'subprocess failed').slice(-4000);throw Error(`${exe} failed: ${diagnostic}`);}
}
function cleanPgEnv(){const env={...process.env};for(const k of Object.keys(env))if(/^PG(HOST|HOSTADDR|PORT|DATABASE|USER|PASSWORD|PASSFILE|SERVICE|SERVICEFILE|OPTIONS|SSLMODE|TARGETSESSIONATTRS|APPNAME|CONNECT_TIMEOUT)$/.test(k))delete env[k];return env;}
function verifiedBackup(){
 check(backup.startsWith(backupRoot+path.sep)&&fs.realpathSync(backup).toLowerCase()===backup.toLowerCase(),'Backup path escaped the isolated backup directory');
 const sums=JSON.parse(fs.readFileSync(path.join(backup,'checksums.json'),'utf8'));
 for(const [name,hash] of Object.entries(sums))check(['before.dump','roles.sql','archive-list.txt'].includes(name)&&crypto.createHash('sha256').update(fs.readFileSync(path.join(backup,name))).digest('hex')===hash,'Backup checksum mismatch');
 const forward=path.join(common.root,'database/migrations/saas/029_automatic_14_day_trial.rehearsal.review.sql');
 const rollback=path.join(common.root,'database/migrations/saas/029_automatic_14_day_trial.rollback.rehearsal.review.sql');
 check(crypto.createHash('sha256').update(fs.readFileSync(forward)).digest('hex')===expectedForwardHash,'Rehearsal forward SQL hash mismatch');
 check(crypto.createHash('sha256').update(fs.readFileSync(rollback)).digest('hex')===expectedRollbackHash,'Rehearsal rollback SQL hash mismatch');
 return {forward,rollback,sums};
}
function envFor(config){
 const env={...process.env,PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable',PGPASSWORD:config.operatorPassword};
 for(const k of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGDATABASE','PGUSER','PGHOST','PGPORT','PGPASSFILE'])delete env[k];
 return env;
}
function cliConnection(user,password){const env=envFor(common.configuration());env.PGPASSWORD=password;return ['-h','127.0.0.1','-p',String(port),'-U',user,'--no-password'];}
function dbConnection(role){
 const c=common.configuration();
 const pw=role==='vtv_saas_operator'?c.operatorPassword:role==='vtv_web_runtime'?c.authPassword:c.businessPassword;
 return {host:'127.0.0.1',port,database:dbName,user:role,password:pw,ssl:false,connectionTimeoutMillis:4000,statement_timeout:12000};
}
async function connect(role){const c=new Client(dbConnection(role));await c.connect();return c;}
async function checkTarget(){
 const c=await connect('vtv_saas_operator');try{
  const x=(await c.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_user role,session_user session_role,replace(current_setting('data_directory'),E'\\\\','/') data_dir")).rows[0];
  check(x.db===dbName&&x.host==='127.0.0.1'&&x.port===port&&x.role==='vtv_saas_operator'&&x.session_role===x.role&&x.data_dir==='D:/vetthevat/.trial-029-rehearsal/cluster','Disposable PostgreSQL identity assertion failed');
 }finally{await c.end();}
}
async function initCluster(config,files){
 if(fs.existsSync(root))check(rootCreated&&fs.existsSync(path.join(root,'owner.marker'))&&fs.readFileSync(path.join(root,'owner.marker'),'utf8')===generatedMarker,'Rehearsal directory already exists; refusing to reuse or delete it');
 // Port probe only; never stop an existing listener.
 await new Promise((resolve,reject)=>{const net=require('node:net'),s=net.createServer();s.once('error',()=>reject(Error(`Rehearsal port ${port} is already occupied; no process stopped`)));s.listen(port,'127.0.0.1',()=>s.close(resolve));});
 if(!fs.existsSync(root)){fs.mkdirSync(root,{recursive:false});rootCreated=true;fs.writeFileSync(path.join(root,'owner.marker'),generatedMarker,{flag:'wx',mode:0o600});}
 check(!fs.existsSync(cluster),'Disposable cluster directory already exists; refusing to reuse');
 fs.mkdirSync(cluster,{recursive:false});
 const superPassword=crypto.randomBytes(32).toString('base64url');
 const passwordFile=path.join(root,'pg-superuser-password.tmp');fs.writeFileSync(passwordFile,superPassword+'\n',{flag:'wx',mode:0o600});
 try{run('initdb.exe',['-D',cluster,'-U','postgres','--encoding=UTF8','--auth-local=scram-sha-256','--auth-host=scram-sha-256','--pwfile',passwordFile],cleanPgEnv());}
 finally{fs.rmSync(passwordFile,{force:true});}
 const configFile=path.join(cluster,'postgresql.conf');fs.appendFileSync(configFile,`\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=40\npassword_encryption='scram-sha-256'\n`);
 serverStarted=true;
 try{run('pg_ctl.exe',['-D',cluster,'-l',path.join(root,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],cleanPgEnv());}
 catch(e){
  // Windows may report a transient pg_ctl wrapper exit after the server has
  // started; accept only an independently verified running cluster.
  try{run('pg_ctl.exe',['-D',cluster,'status'],cleanPgEnv());}
  catch{serverStarted=false;throw e;}
 }
 const superEnv=envFor(config);superEnv.PGPASSWORD=superPassword;
 console.log('REHEARSAL restoring role definitions into disposable cluster');
 run('psql.exe',['-h','127.0.0.1','-p',String(port),'-U','postgres','--no-password','-v','ON_ERROR_STOP=1','-d','postgres','-f',path.join(backup,'roles.sql')],superEnv);
 const roleCheck=run('psql.exe',['-h','127.0.0.1','-p',String(port),'-U','postgres','--no-password','-v','ON_ERROR_STOP=1','-At','-d','postgres','-c',"SELECT count(*) FROM pg_roles WHERE rolname IN ('vtv_saas_operator','vtv_web_runtime','vtv_saas_runtime')"],superEnv).toString().trim();
 check(roleCheck==='3',`Backup roles did not restore in disposable instance (found ${roleCheck})`);
 console.log('REHEARSAL restoring database archive');
 run('pg_restore.exe',['-h','127.0.0.1','-p',String(port),'-U','postgres','--no-password','--exit-on-error','--create','-d','postgres',path.join(backup,'before.dump')],superEnv);
 console.log('REHEARSAL validating restored role connections and target identity');
 await checkTarget();
 // Confirm the imported runtime credential and least-privilege application role work.
 const web=await connect('vtv_web_runtime');try{const row=(await web.query("SELECT current_database() db,current_user role,session_user session_role,(SELECT id::text FROM web_auth.installation WHERE version=1) installation")).rows[0];check(row.db===dbName&&row.role==='vtv_web_runtime'&&row.session_role===row.role&&row.installation===config.authInstallationId,'Restored application role/installation mismatch');}finally{await web.end();}
 ok('fresh backup restored in isolated PostgreSQL 17 cluster',{port,backupChecksumsVerified:true});
}
async function applyMigration(files){
 const env=envFor(common.configuration());
 run('psql.exe',[...cliConnection('vtv_saas_operator',common.configuration().operatorPassword),'-v','ON_ERROR_STOP=1','-d',dbName,'-f',files.forward],env);
 const c=await connect('vtv_saas_operator');try{
  const r=(await c.query("SELECT to_regclass('saas.trial_history') IS NOT NULL history,(SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='saas' AND table_name='subscription_entitlements' AND column_name IN('trial_started_at','trial_expires_at','trial_status')) cols")).rows[0];
  check(r.history&&r.cols,'Migration did not install expected objects');
 }finally{await c.end();}
 ok('rehearsal migration applied');
}
async function rollback(files,shouldSucceed){
 const env=envFor(common.configuration());let failure='';
 try{run('psql.exe',[...cliConnection('vtv_saas_operator',common.configuration().operatorPassword),'-v','ON_ERROR_STOP=1','-d',dbName,'-f',files.rollback],env);}
 catch(e){failure=e.message;}
 const c=await connect('vtv_saas_operator');try{
  const x=(await c.query("SELECT to_regclass('saas.trial_history') IS NOT NULL history,(SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='saas' AND table_name='subscription_entitlements' AND column_name IN('trial_started_at','trial_expires_at','trial_status')) cols")).rows[0];
  x.trials=x.history?(await c.query('SELECT count(*)::int FROM saas.trial_history')).rows[0].count:0;
  if(shouldSucceed){check(!failure&&!x.history&&!x.cols,'Rollback before trial issuance did not complete');ok('rollback succeeds before any trial is issued');}
  else{check(failure.includes('Rollback refused')&&x.history&&x.cols&&Number(x.trials)>0,`Rollback after trial issuance did not safely refuse; error=${failure}; state=${JSON.stringify(x)}`);ok('rollback refuses after a trial is issued',{trials:x.trials});}
 }finally{await c.end();}
}
function makeServices(){
 const pool=require('pg');
 const transaction=async action=>{const c=new pool.Client(dbConnection('vtv_web_runtime'));await c.connect();try{await c.query('BEGIN');const result=await action(c);await c.query('COMMIT');return result;}catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}finally{await c.end();}};
 const Store=loadSource('lib/server/web-auth/store').WebAuthStore;
 const store=new Store(transaction),config=common.configuration();
 const services={store,config:{environment:'test',origin:'https://localhost:3444',installationId:config.authInstallationId,csrfSecret:config.csrfSecret,outboxKey:config.outboxKey,mailApproved:false}};
 return {services,store,auth:loadSource('lib/server/web-auth/core'),saas:loadSource('lib/server/saas/onboarding'),crypto:loadSource('lib/server/web-auth/crypto')};
}
async function createVerifiedUser(label,parts){
 const {services,store,auth,crypto:cryptoApi}=parts;
 const email=`${label}-${crypto.randomUUID()}@example.test`,password=crypto.randomBytes(24).toString('base64url');
 console.log('REHEARSAL auth registration submitted');
 await auth.registerAccount({email,password,fullName:'Disposable Trial Rehearsal'},services);
 console.log('REHEARSAL auth registration committed');
 let user=await store.findUser(email);check(user&&!user.email_verified_at,'Registration did not create an unverified account');
 const outbox=await services.store.transaction(async sql=>(await sql.query("SELECT ciphertext,iv,tag FROM web_auth.notification_outbox WHERE user_id=$1 AND kind='verify_email' ORDER BY created_at DESC LIMIT 1",[user.id])).rows[0]);
 check(Boolean(outbox),'Registration verification email was not queued');
 const message=cryptoApi.decryptNotification(outbox,services.config.outboxKey),token=new URL(message.url).searchParams.get('token');
 check(cryptoApi.validToken(token),'Verification token format invalid');
 await auth.consumeAccountToken({token},services,'verify_email');
 user=await store.findUser(email);check(Boolean(user.email_verified_at),'Verification did not mark identity verified');
 const login=await auth.loginAccount({email,password},services),principal=await store.principal(cryptoApi.tokenHash(login.token));
 return {user,tokenHash:principal.tokenHash,principal};
}
async function business(company,tokenHash,permission){
 const c=await connect('vtv_saas_runtime');try{await c.query('BEGIN');await c.query("SELECT set_config('app.company_id',$1,true),set_config('app.session_hash',$2,true)",[company,tokenHash]);const row=(await c.query('SELECT saas.authorized_company($1,$2) allowed,(SELECT count(*)::int FROM saas.lock_authorization($1,$2)) lock_count',[company,permission])).rows[0];await c.query('COMMIT');return row;}catch(e){try{await c.query('ROLLBACK');}catch{}throw e;}finally{await c.end();}
}
async function createCompanyFor(user,parts,name){
 const {saas}=parts,key=crypto.randomBytes(24).toString('base64url');
 return saas.onboardCompany(parts.services,user.principal,{name,currency:'GBP',accountId:null},key);
}
async function trialBehavior(){
 const parts=makeServices(),first=await createVerifiedUser('trial-owner',parts);console.log('REHEARSAL identity verified and login complete');const company=await createCompanyFor(first,parts,'Trial Rehearsal Ltd');
 check(company.status==='active'&&company.trialStatus==='active'&&company.paymentConfirmed===false&&company.trialDays===14&&company.orsIncluded===true,'Automatic trial fields/limits were not returned');
 const base=await connect('vtv_saas_operator');let ownerRow;
 try{ownerRow=(await base.query(`SELECT c.owner_id,m.role,m.status membership_status,cp.status company_status,a.owner_id account_owner,e.plan,e.status entitlement_status,e.invoices_per_month,e.company_limit,e.seat_limit,e.ors_enabled,e.trial_started_at,e.trial_expires_at,e.trial_status,h.status history_status,extract(epoch from (h.expires_at-h.started_at))::int duration_seconds FROM web_auth.companies c JOIN web_auth.company_memberships m ON m.company_id=c.id AND m.user_id=c.owner_id JOIN saas.company_profiles cp ON cp.company_id=c.id JOIN saas.billing_accounts a ON a.id=cp.account_id JOIN saas.subscription_entitlements e ON e.account_id=a.id JOIN saas.trial_history h ON h.account_id=a.id WHERE c.id=$1`,[company.id])).rows[0];}
 finally{await base.end();}
 check(ownerRow.owner_id===first.user.id&&ownerRow.account_owner===first.user.id&&ownerRow.role==='Owner'&&ownerRow.membership_status==='active'&&ownerRow.entitlement_status==='active'&&ownerRow.plan==='Starter'&&ownerRow.invoices_per_month===100&&ownerRow.company_limit===2&&ownerRow.seat_limit===4&&ownerRow.ors_enabled&&ownerRow.trial_status==='active'&&ownerRow.history_status==='active'&&ownerRow.duration_seconds===14*24*60*60,'Company owner, entitlement or history records incorrect');
 const allowed=await business(company.id,first.tokenHash,'invoices:write');check(allowed.allowed&&allowed.lock_count===1,'Active trial did not authorize company owner');
 let duplicateError;try{await createCompanyFor(first,parts,'Second automatic trial');}catch(e){duplicateError=e;}
 check(duplicateError?.status===409,'Duplicate first-company trial was not prevented');
 // A second verified identity gets a separate company, but cannot cross into the first tenant.
 const second=await createVerifiedUser('trial-other',parts),other=await createCompanyFor(second,parts,'Other Tenant Trial Ltd');
 const cross=await business(other.id,first.tokenHash,'company:read');
 check(!cross.allowed&&cross.lock_count===0,'Foreign user gained authorization in another tenant');
 const tenant=await connect('vtv_saas_runtime');try{await tenant.query('BEGIN');await tenant.query("SELECT set_config('app.company_id',$1,true),set_config('app.session_hash',$2,true)",[company.id,first.tokenHash]);const rows=await tenant.query('SELECT company_id FROM saas.company_profiles WHERE company_id=$1',[other.id]);await tenant.query('ROLLBACK');check(rows.rowCount===0,'RLS exposed a foreign company profile');}finally{await tenant.end();}
 // Move the DB-authoritative 14-day window into the past while preserving its duration constraint.
 const admin=await connect('vtv_saas_operator');try{await admin.query('BEGIN');await admin.query('SET LOCAL ROLE vtv_saas_owner');await admin.query(`UPDATE saas.subscription_entitlements SET trial_started_at=statement_timestamp()-interval '15 days',trial_expires_at=statement_timestamp()-interval '1 day' WHERE account_id=$1`,[company.accountId]);await admin.query('COMMIT');}catch(e){try{await admin.query('ROLLBACK');}catch{}throw e;}finally{await admin.end();}
 await parts.saas.ownedBillingAccounts(parts.services,first.principal);
 const status=await connect('vtv_saas_operator');let expired;
 try{expired=(await status.query('SELECT trial_status,(SELECT status FROM saas.trial_history WHERE account_id=$1) history_status FROM saas.subscription_entitlements WHERE account_id=$1',[company.accountId])).rows[0];}finally{await status.end();}
 check(expired.trial_status==='expired'&&expired.history_status==='expired','Trial expiry state/history failed to transition');
 const read=await business(company.id,first.tokenHash,'reports:read'),write=await business(company.id,first.tokenHash,'invoices:write');
 check(read.allowed&&!write.allowed,'Expired trial read-only entitlement enforcement failed');
 let expiredNewCompany;try{await parts.saas.onboardCompany(parts.services,first.principal,{name:'Expired Add-on',currency:'GBP',accountId:company.accountId},crypto.randomBytes(24).toString('base64url'));}catch(e){expiredNewCompany=e;}
 check(expiredNewCompany?.status===403,'Expired entitlement allowed onboarding an additional company');
 ok('registration, verification, login and first-company automatic trial exercised through application domain services');
}
async function cycle(files,config,mode){
 await initCluster(config,files);
 try{
  await applyMigration(files);
  if(mode==='rollback-before-trial'){await rollback(files,true);}
  else{await trialBehavior();await rollback(files,false);}
 }finally{
  if(serverStarted){run('pg_ctl.exe',['-D',cluster,'-m','fast','-w','stop'],cleanPgEnv());serverStarted=false;await new Promise(r=>setTimeout(r,1000));}
 }
}
async function cleanup(){
 if(serverStarted){run('pg_ctl.exe',['-D',cluster,'-m','fast','-w','stop'],cleanPgEnv());serverStarted=false;}
 if(rootCreated&&!serverStarted&&fs.existsSync(path.join(root,'owner.marker'))&&fs.readFileSync(path.join(root,'owner.marker'),'utf8')===generatedMarker){
  let last;
  for(let i=0;i<8;i++){
   try{fs.rmSync(root,{recursive:true,force:true});rootCreated=false;return;}
   catch(e){last=e;if(e.code!=='EBUSY'&&e.code!=='EPERM')throw e;await new Promise(r=>setTimeout(r,500));}
  }
  throw last;
 }
}
async function main(){
 const config=common.configuration(),files=verifiedBackup();
 check(fs.realpathSync(common.root).toLowerCase()===common.root.toLowerCase(),'Workspace root redirected');
 let rehearsalError,cleanupError;
 try{
  if(process.argv[3]!=='--after-trial-only'){
   await cycle(files,config,'rollback-before-trial');
   check(fs.existsSync(path.join(root,'owner.marker'))&&fs.readFileSync(path.join(root,'owner.marker'),'utf8')===generatedMarker,'Rehearsal ownership marker lost');
   fs.rmSync(cluster,{recursive:true,force:true});
  }
  await cycle(files,config,'trial-and-rollback-refusal');
 }catch(e){rehearsalError=e;}
 try{await cleanup();}catch(e){cleanupError=e;}
 console.log(JSON.stringify({architecture:'dedicated PostgreSQL 17 loopback cluster on 127.0.0.1:55441 with task-specific data directory; no 55440 connection configured',backup:backup,backupChecksumsVerified:true,rehearsalSql:{forward:expectedForwardHash,rollback:expectedRollbackHash},results,actualDevelopmentDatabaseTouched:false,rehearsalError:rehearsalError?.message||null,cleanupError:cleanupError?.message||null},null,2));
 if(rehearsalError)throw rehearsalError;
 if(cleanupError)throw cleanupError;
}
main().catch(e=>{console.error('Isolated trial rehearsal stopped:',e.stack||e.message);process.exitCode=1;});

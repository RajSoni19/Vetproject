// Operator-only. Never imported by a route/startup. Default is review, no writes.
const s=require('./saas-dev-common.cjs'),{Client}=require('pg'),{hash}=require('@node-rs/argon2');
const approval='CREATE VERIFIED-BY-LINK ADMINISTRATOR ONLY IN 127.0.0.1:55440/vtv_saas_dev';
async function run(){
 if(!process.argv.includes('--execute')){console.log('PREVIEW ONLY: separately approve one admin@vetthevat.com identity/UID grant in the existing isolated 55440 database. No user/password/link/grant is created. Execution requires exact operator approval, private name/password, unused bootstrap marker, verified cluster/installation/checksums and later one-use email verification. No company authority is granted.');return;}
 if(process.env.VERCEL!==undefined||process.env.SAAS_ADMIN_BOOTSTRAP_APPROVAL!==approval)throw Error('Separate exact bootstrap approval is required');
 const c=s.configuration(),name=process.env.SAAS_ADMIN_FULL_NAME?.normalize('NFKC').trim(),password=process.env.SAAS_ADMIN_PASSWORD;
 if(!name||name.length>120||/[\x00-\x1f\x7f]/.test(name)||typeof password!=='string'||password.length<12||password.length>128||Buffer.byteLength(password)>512||password.includes('\0'))throw Error('Supply a private valid name and unique password');
 for(const [file,expected]of [['001_saas_foundation.review.sql',c.approvedSqlHash],['002_stage_a_authorization_locks.review.sql','082079c74f4788fa5724a30f86a443c46ed0179c8c0329c756a9323a690d80fd']])if(s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(s.root,'database/migrations/saas',file))).digest('hex')!==expected)throw Error('Stage A checksum mismatch');
 const encoded=await hash(password,{algorithm:2,version:1,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32}),db=new Client(s.connection('vtv_saas_operator'));await db.connect();let begun=false;
 try{
  const row=(await db.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS cluster,current_user AS role,session_user AS session_role,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,(SELECT id::text FROM web_auth.installation WHERE version=1) AS auth_installation")).rows[0];
  if(row.database!=='vtv_saas_dev'||row.host!=='127.0.0.1'||row.port!==55440||row.role!=='vtv_saas_operator'||row.session_role!==row.role||s.path.resolve(row.cluster).toLowerCase()!==s.path.resolve(s.directory,'cluster').toLowerCase()||row.installation!==c.installationId||row.auth_installation!==c.authInstallationId)throw Error('Unapproved bootstrap target');
  await db.query('BEGIN');begun=true;await db.query('SELECT pg_advisory_xact_lock(8164,1)');
  if((await db.query('SELECT 1 FROM web_auth.bootstrap_once')).rowCount||(await db.query("SELECT 1 FROM web_auth.users WHERE email='admin@vetthevat.com'")).rowCount)throw Error('Existing account or bootstrap marker refused');
  const role=(await db.query("SELECT id FROM web_auth.roles WHERE name='software_administrator' FOR SHARE")).rows[0];if(!role)throw Error('Expected administrator role absent');
  const user=(await db.query("INSERT INTO web_auth.users(full_name,email,password_hash) VALUES($1,'admin@vetthevat.com',$2) RETURNING id",[name,encoded])).rows[0];
  await db.query('INSERT INTO web_auth.user_roles(user_id,role_id) VALUES($1,$2)',[user.id,role.id]);await db.query('INSERT INTO web_auth.bootstrap_once(user_id) VALUES($1)',[user.id]);
  const token=s.crypto.randomBytes(32).toString('base64url');await db.query("INSERT INTO web_auth.email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '24 hours')",[user.id,s.crypto.createHash('sha256').update(token).digest('hex')]);
  const iv=s.crypto.randomBytes(12),cipher=s.crypto.createCipheriv('aes-256-gcm',Buffer.from(c.outboxKey,'hex'),iv),ciphertext=Buffer.concat([cipher.update(JSON.stringify({to:'admin@vetthevat.com',name,url:'https://localhost:3444/verify-email?token='+token}),'utf8'),cipher.final()]).toString('base64');
  await db.query("INSERT INTO web_auth.notification_outbox(user_id,kind,ciphertext,iv,tag) VALUES($1,'verify_email',$2,$3,$4)",[user.id,ciphertext,iv.toString('hex'),cipher.getAuthTag().toString('hex')]);
  await db.query("INSERT INTO web_auth.audit_logs(actor_user_id,action,metadata) VALUES($1,'auth.bootstrap',$2::jsonb)",[user.id,JSON.stringify({environment:'isolated-development',emailVerificationRequired:true})]);
  const commit=await db.query('COMMIT');begun=false;if(commit.command!=='COMMIT')throw Error('Commit not acknowledged; inspect before any retry');
  console.log('Isolated administrator bootstrap COMMIT acknowledged. Identity remains unverified until the one-use link is securely consumed. No mail sent or company authority assigned.');
 }catch(e){if(begun)try{await db.query('ROLLBACK');}catch{}throw e;}finally{await db.end();}
}
if(require.main===module)run().catch(()=>{console.error('Bootstrap refused/failed. No credentials or tokens logged. Inspect state before retrying an uncertain COMMIT.');process.exitCode=1;});
module.exports={run,approval};

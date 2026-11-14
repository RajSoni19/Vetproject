// Operator command only. NOT called by import, build, app startup or any endpoint.
const {configuration,connection,load}=require('./pg-auth-common.cjs');const {Client}=require('pg');
async function run(){const c=configuration();if(!process.argv.includes('--execute')){console.log('DRY RUN: one administrator for admin@vetthevat.com in NEW 127.0.0.1:55439/vtv_web_auth_test. Requires separate owner approval, explicit confirmation, private name/password and a single unused bootstrap marker. No account created.');return;}
 if(process.env.WEB_AUTH_BOOTSTRAP_CONFIRM!=='CREATE ADMINISTRATOR IN vtv_web_auth_test')throw Error('Exact operator confirmation required.');
 const {passwordHash}=load('lib/server/web-auth/crypto'),hash=await passwordHash(process.env.WEB_AUTH_BOOTSTRAP_PASSWORD??''),name=process.env.WEB_AUTH_BOOTSTRAP_NAME?.trim();if(!name||name.length>120)throw Error('Private administrator name required.');
 const client=new Client(connection('vtv_test_operator'));await client.connect();try{
  const target=(await client.query('SELECT current_database() AS db,(SELECT id::text FROM web_auth.installation) AS installation')).rows[0];if(target.db!==c.database||target.installation!==c.installationId)throw Error('Database fingerprint mismatch.');
  await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(8164,1)");
  if((await client.query('SELECT 1 FROM web_auth.bootstrap_once')).rowCount)throw Error('Bootstrap already consumed.');
  if((await client.query("SELECT 1 FROM web_auth.users WHERE email='admin@vetthevat.com'")).rowCount)throw Error('Existing account refused; no password reset or role takeover.');
  const user=(await client.query("INSERT INTO web_auth.users(full_name,email,password_hash) VALUES($1,'admin@vetthevat.com',$2) RETURNING id",[name,hash])).rows[0];
  await client.query("INSERT INTO web_auth.user_roles(user_id,role_id) SELECT $1,id FROM web_auth.roles WHERE name='software_administrator'",[user.id]);await client.query('INSERT INTO web_auth.bootstrap_once(user_id) VALUES($1)',[user.id]);
  await client.query("INSERT INTO web_auth.audit_logs(actor_user_id,action) VALUES($1,'auth.bootstrap')",[user.id]);await client.query('COMMIT');console.log('Operator-approved administrator created; email verification is still required before login.');
 }catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}finally{await client.end();}}
run().catch(()=>{console.error('Bootstrap refused or failed. No credentials logged.');process.exitCode=1;});

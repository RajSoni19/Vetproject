// Real PostgreSQL 17 verification for reviewed migration 005. This test uses a
// fresh random password only long enough to authenticate the isolated runtime
// role, then removes it. It never contacts Stripe, Resend, port 55439, or a
// production service.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Client}=require('pg');
const common=require('../scripts/saas-dev-common.cjs');
const {run}=require('../scripts/saas-reviewed-migration.cjs');

const migration='005_provider_event_inbox.review.sql';
const checksum='5a3744e9aefbb40f6134a1ed032c994c9162b5efaecfe2a5d5f3e8b27d23a816';
const eventId=`evt_isolated_${crypto.randomUUID().replaceAll('-','')}`;
const digest=crypto.createHash('sha256').update(eventId).digest('hex');
const runtimePassword=crypto.randomBytes(32).toString('base64url');
let operator;

function target(client){return client.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_user AS role,session_user AS session_role");}
function providerConnection(){const c=common.configuration();return new Client({host:c.host,port:c.port,database:c.database,user:'vtv_saas_provider_runtime',password:runtimePassword,ssl:false,connectionTimeoutMillis:5000,statement_timeout:10000});}

test.before(async()=>{
 assert.equal(crypto.createHash('sha256').update(common.fs.readFileSync(common.path.join(common.root,'database/migrations/saas',migration))).digest('hex'),checksum);
 operator=new Client(common.connection('vtv_saas_operator'));await operator.connect();
 const actual=(await target(operator)).rows[0],c=common.configuration();
 assert.deepEqual({...actual,directory:common.path.resolve(actual.directory)},{database:'vtv_saas_dev',host:'127.0.0.1',port:55440,directory:common.path.resolve(common.directory,'cluster'),role:'vtv_saas_operator',session_role:'vtv_saas_operator'});
 assert.equal(c.database,'vtv_saas_dev');
 const passwordSql=(await operator.query("SELECT format('ALTER ROLE vtv_saas_provider_runtime PASSWORD %L',$1::text) AS sql",[runtimePassword])).rows[0].sql;
 await operator.query(passwordSql);
});

test.after(async()=>{try{await operator.query('ALTER ROLE vtv_saas_provider_runtime PASSWORD NULL');await operator.query('DELETE FROM saas.provider_events WHERE provider_event_id=$1',[eventId]);}finally{await operator.end();}});

test('migration 005 catalog installs forced RLS, constrained role and no runtime table grant',async()=>{
 const table=(await operator.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='saas.provider_events'::regclass")).rows[0];assert.deepEqual(table,{relrowsecurity:true,relforcerowsecurity:true});
 const policy=(await operator.query("SELECT cmd,roles::text AS roles FROM pg_policies WHERE schemaname='saas' AND tablename='provider_events' AND policyname='provider_events_owner'")).rows[0];assert.deepEqual(policy,{cmd:'ALL',roles:'{vtv_saas_owner}'});
 const role=(await operator.query("SELECT rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname='vtv_saas_provider_runtime'")).rows[0];assert.deepEqual(role,{rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false});
 const access=(await operator.query("SELECT has_table_privilege('vtv_saas_provider_runtime','saas.provider_events','SELECT') AS select_allowed,has_table_privilege('vtv_saas_provider_runtime','saas.provider_events','INSERT') AS insert_allowed,has_function_privilege('vtv_saas_provider_runtime','saas.record_provider_event(text,text,char(64),jsonb)','EXECUTE') AS function_allowed")).rows[0];assert.deepEqual(access,{select_allowed:false,insert_allowed:false,function_allowed:true});
});

test('provider role durably saves once, rejects direct access and prevents conflicting duplicate identity',async()=>{
 const db=providerConnection();await db.connect();try{
  const first=(await db.query("SELECT saas.record_provider_event($1,$2,$3,$4::jsonb) AS recorded",['stripe',eventId,digest,JSON.stringify({id:eventId,type:'customer.subscription.updated',livemode:false})])).rows[0];assert.equal(first.recorded,true);
  const repeat=(await db.query("SELECT saas.record_provider_event($1,$2,$3,$4::jsonb) AS recorded",['stripe',eventId,digest,JSON.stringify({id:eventId,type:'customer.subscription.updated',livemode:false})])).rows[0];assert.equal(repeat.recorded,false);
  await assert.rejects(db.query("SELECT saas.record_provider_event($1,$2,$3,$4::jsonb)",['stripe',eventId,'b'.repeat(64),JSON.stringify({id:eventId,type:'changed',livemode:false})]),error=>error.code==='23505');
  await assert.rejects(db.query('SELECT * FROM saas.provider_events'),error=>error.code==='42501');
  await assert.rejects(db.query('CREATE TABLE saas.provider_inbox_forbidden(id integer)'),error=>error.code==='42501');
 }finally{await db.end();}
 const saved=(await operator.query('SELECT provider,payload_sha256,state FROM saas.provider_events WHERE provider_event_id=$1',[eventId])).rows;assert.deepEqual(saved,[{provider:'stripe',payload_sha256:digest,state:'queued'}]);
});

test('provider insert rolls back with its transaction and web runtime cannot call the function',async()=>{
 const rolled=`evt_rollback_${crypto.randomUUID().replaceAll('-','')}`,db=providerConnection();await db.connect();try{await db.query('BEGIN');await db.query("SELECT saas.record_provider_event($1,$2,$3,$4::jsonb)",['stripe',rolled,crypto.createHash('sha256').update(rolled).digest('hex'),JSON.stringify({id:rolled,type:'customer.subscription.updated',livemode:false})]);await db.query('ROLLBACK');}finally{await db.end();}
 assert.equal((await operator.query('SELECT id FROM saas.provider_events WHERE provider_event_id=$1',[rolled])).rowCount,0);
 const web=new Client(common.connection('vtv_saas_runtime'));await web.connect();try{await assert.rejects(web.query("SELECT saas.record_provider_event($1,$2,$3,$4::jsonb)",['stripe',`evt_forbidden_${crypto.randomUUID().replaceAll('-','')}`,digest,JSON.stringify({})]),error=>error.code==='42501');}finally{await web.end();}
});

test('approved migration runner refuses the already committed migration before backup or SQL execution',async()=>{
 const prior=process.env.SAAS_APPROVED_MIGRATION_SHA256;process.env.SAAS_APPROVED_MIGRATION_SHA256=checksum;try{await assert.rejects(run('005',true),/Existing migration state refused/);}finally{if(prior===undefined)delete process.env.SAAS_APPROVED_MIGRATION_SHA256;else process.env.SAAS_APPROVED_MIGRATION_SHA256=prior;}
});

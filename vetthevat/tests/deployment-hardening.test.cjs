const test=require('node:test'),assert=require('node:assert/strict'),tls=require('node:tls'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadSource}=require('./load-source.cjs');

test('managed and malformed deployment profiles refuse every development originals adapter before touching disk',()=>{
 const {localPrivateOriginals}=loadSource('lib/server/saas/local-originals'),{readPrivateS3Configuration}=loadSource('lib/server/saas/s3-config');
 const env={SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',WEB_AUTH_ENV:'development',WEB_AUTH_ORIGIN:'https://localhost:3444',SAAS_DATABASE_APPROVED:'vtv_saas_dev',SAAS_OBJECT_STORAGE_ENABLED:'1',SAAS_OBJECT_STORAGE_APPROVED:'vtv-saas-dev-private',SAAS_OBJECT_ENDPOINT:'http://127.0.0.1:59000',SAAS_OBJECT_BUCKET:'vtv-saas-dev-private',SAAS_OBJECT_REGION:'us-east-1',SAAS_OBJECT_ACCESS_KEY:'synthetic',SAAS_OBJECT_SECRET_KEY:'synthetic-private-fixture'};
 assert.ok(readPrivateS3Configuration(env));
 for(const profile of ['staging','production','broken']){
  assert.equal(readPrivateS3Configuration({...env,VTV_DEPLOYMENT_PROFILE:profile}),undefined);
  assert.equal(localPrivateOriginals({...env,VTV_DEPLOYMENT_PROFILE:profile},'nonexistent-must-never-open'),undefined);
 }
});

test('worker probe rejects missing, invalid, stale, future, foreign-release and unknown-state heartbeats',()=>{
 const {validHeartbeat}=require('../deploy/ubuntu/worker-smoke.cjs'),now=Date.now(),value={kind:'mail',state:'accepted',release:'release-fixture1',at:new Date(now).toISOString()};
 assert.equal(validHeartbeat(value,'mail',value.release,now),true);
 for(const patch of [{at:undefined},{at:'invalid'},{at:new Date(now-120001).toISOString()},{at:new Date(now+6000).toISOString()},{release:'release-old'},{kind:'stripe'},{state:'disabled'},{state:'error'},{state:'invented'}])assert.equal(validHeartbeat({...value,...patch},'mail',value.release,now),false);
 assert.equal(validHeartbeat(null,'mail',value.release,now),false);
});

test('PostgreSQL transport proof requires an actual authorized TLS socket and the expected peer hostname',async()=>{
 const {assertPostgresTransport}=loadSource('lib/server/postgres-tls'),{key,cert}=require('./fixtures/tls-fixture.cjs').tlsFixture();
 assert.throws(()=>assertPostgresTransport({connection:{stream:{encrypted:true,authorized:true}}},'localhost'));
 const sockets=new Set(),server=tls.createServer({key,cert},s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 let socket;
 try{
  socket=tls.connect({host:'127.0.0.1',port:server.address().port,servername:'localhost',ca:cert,rejectUnauthorized:true,minVersion:'TLSv1.2'});
  await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject);});
  assert.doesNotThrow(()=>assertPostgresTransport({connection:{stream:socket}},'localhost'));
  assert.throws(()=>assertPostgresTransport({connection:{stream:socket}},'wrong-host.example.com'));
  // A proxy's backend ssl=false must not replace actual transport verification.
  // This exercises our transaction adapter with injected SQL responses, not Neon.
  const {createCompanyDatabase}=loadSource('lib/server/saas/transactions'),id=crypto.randomUUID(),calls=[];
  const client={connection:{stream:socket},release:()=>{},query:async sql=>{calls.push(sql);return {command:sql==='COMMIT'?'COMMIT':undefined,rows:sql.includes('FROM pg_roles')?[{database:'vtv_saas_staging',role:'vtv_saas_runtime',session_role:'vtv_saas_runtime',installation:id,safe:true,tls:false}]:sql.includes('lock_authorization')?[{actor_id:crypto.randomUUID(),session_id:crypto.randomUUID()}]:[]};}};
  const database=createCompanyDatabase({connect:async()=>client},{managed:true,installationId:id,database:{host:'localhost',name:'vtv_saas_staging',user:'vtv_saas_runtime'}});
  assert.equal(await database.scoped({sessionCookie:crypto.randomBytes(32).toString('base64url'),companyId:crypto.randomUUID(),permission:'company:read'},async()=>42),42);
  assert.ok(calls.includes('COMMIT'));
  socket.destroy();assert.throws(()=>assertPostgresTransport({connection:{stream:socket}},'localhost'));
 }finally{socket?.destroy();for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}
});

test('Neon profile binds London direct endpoints and refuses pooling, other regions and cross-environment CA files',()=>{
 const {readManagedDeployment}=loadSource('lib/server/deployment-profile'),id=crypto.randomUUID(),host='ep-synthetic-example.eu-west-2.aws.neon.tech';
 const env={VTV_DEPLOYMENT_PROFILE:'staging',VTV_DATABASE_PROVIDER:'neon',VTV_PUBLIC_ORIGIN:'https://staging.vetthevat.com',VTV_DATABASE_HOST:host,VTV_APPROVED_DATABASE_HOST:host,VTV_DATABASE_PORT:'5432',VTV_DATABASE_NAME:'vtv_saas_staging',VTV_APPROVED_DATABASE_NAME:'vtv_saas_staging',VTV_DATABASE_CA_FILE:'/etc/vetthevat/staging/postgres-ca.pem',SAAS_INSTALLATION_ID:id,WEB_AUTH_INSTALLATION_ID:id,VTV_MANAGED_RUNTIME_APPROVED:'staging:'+id};
 assert.ok(readManagedDeployment(env));
 assert.equal(readManagedDeployment({...env,VTV_DATABASE_PROVIDER:undefined}),undefined);
 for(const bad of ['ep-synthetic-example-pooler.eu-west-2.aws.neon.tech','ep-synthetic-example.us-east-2.aws.neon.tech','other-provider.example.com'])assert.equal(readManagedDeployment({...env,VTV_DATABASE_HOST:bad,VTV_APPROVED_DATABASE_HOST:bad}),undefined);
 assert.equal(readManagedDeployment({...env,VTV_DATABASE_CA_FILE:'/etc/vetthevat/production/postgres-ca.pem'}),undefined);
});

test('ServerVerse PostgreSQL accepts only the approved production loopback endpoint with verified TLS configuration',()=>{
 const {readManagedDeployment,managedDatabase}=loadSource('lib/server/deployment-profile'),id=crypto.randomUUID(),port=55432;
 const env={VTV_DEPLOYMENT_PROFILE:'production',VTV_DATABASE_PROVIDER:'serververse',VTV_PUBLIC_ORIGIN:'https://vetthevat.com',VTV_DATABASE_HOST:'127.0.0.1',VTV_APPROVED_DATABASE_HOST:'127.0.0.1',VTV_DATABASE_PORT:String(port),VTV_DATABASE_NAME:'vtv_saas_production',VTV_APPROVED_DATABASE_NAME:'vtv_saas_production',VTV_DATABASE_CA_FILE:'/etc/vetthevat/production/postgres-ca.pem',SAAS_INSTALLATION_ID:id,WEB_AUTH_INSTALLATION_ID:crypto.randomUUID(),VTV_MANAGED_RUNTIME_APPROVED:'production:'+id,VTV_SERVERVERSE_DATABASE_APPROVED:`production:${id}:${port}`};
 assert.equal(readManagedDeployment(env)?.provider,'serververse');
 const database=managedDatabase(env,`postgresql://vtv_saas_runtime:synthetic@127.0.0.1:${port}/vtv_saas_production`,'vtv_saas_runtime');
 assert.equal(database?.tls,true);assert.equal(database?.caFile,env.VTV_DATABASE_CA_FILE);
 for(const patch of [
  {VTV_DEPLOYMENT_PROFILE:'staging'},
  {VTV_DATABASE_HOST:'localhost',VTV_APPROVED_DATABASE_HOST:'localhost'},
  {VTV_DATABASE_HOST:'10.0.0.4',VTV_APPROVED_DATABASE_HOST:'10.0.0.4'},
  {VTV_DATABASE_PORT:'55440',VTV_SERVERVERSE_DATABASE_APPROVED:`production:${id}:55440`},
  {VTV_DATABASE_PORT:'55439',VTV_SERVERVERSE_DATABASE_APPROVED:`production:${id}:55439`},
  {VTV_SERVERVERSE_DATABASE_APPROVED:`production:${id}:5432`},
  {VTV_MANAGED_RUNTIME_APPROVED:''}
 ])assert.equal(readManagedDeployment({...env,...patch}),undefined);
 assert.equal(managedDatabase(env,`postgresql://vtv_saas_runtime:synthetic@10.0.0.4:${port}/vtv_saas_production`,'vtv_saas_runtime'),undefined);
});

test('activation runtime verifier refuses a Node patch or architecture mismatch before service actions',()=>{
 const {verify}=require('../deploy/ubuntu/verify-runtime.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-runtime-'));
 try{
  fs.mkdirSync(path.join(root,'deploy'));const runtime={node:'22.23.4',architecture:'x64'},release={node:runtime.node,architecture:'x64',platform:'linux'};
  fs.writeFileSync(path.join(root,'deploy/runtime.json'),JSON.stringify(runtime));fs.writeFileSync(path.join(root,'release.json'),JSON.stringify(release));
  assert.equal(verify(root,release).runtimeMatched,true);
  for(const patch of [{node:'22.15.1'},{architecture:'arm64'},{platform:'win32'}])assert.throws(()=>verify(root,{...release,...patch}));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

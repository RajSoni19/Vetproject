// Unit/fault-injection tests. SQL parser tests execute no database statements.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {loadSource}=require('./load-source.cjs');
const {readSaasConfiguration}=loadSource('lib/server/saas/config');
const {createCompanyDatabase}=loadSource('lib/server/saas/transactions');
const {companyPermissions,companyRolePermissions}=loadSource('lib/server/saas/permissions');
const {readPrivateS3Configuration}=loadSource('lib/server/saas/s3-config');
const {originalKey}=loadSource('lib/server/saas/object-storage');
const {privateS3Store}=loadSource('lib/server/saas/s3-storage');
const id=()=>crypto.randomUUID(),installation=id(),company=id(),actor=id(),session=id(),cookie=crypto.randomBytes(32).toString('base64url');
const config={database:{host:'127.0.0.1',port:55440,name:'vtv_saas_dev',user:'vtv_saas_runtime',password:'synthetic-unused'},installationId:installation};
const scope={sessionCookie:cookie,companyId:company,permission:'documents:write'};
function fixture(patch={},fail=()=>{}){
 const calls=[],releases=[];let connects=0;
 const client={release:destroy=>releases.push(destroy),async query(text,values){calls.push({text,values});await fail(text);if(text.startsWith('SELECT current_database'))return {rows:[{database:'vtv_saas_dev',role:'vtv_saas_runtime',session_role:'vtv_saas_runtime',address:'127.0.0.1/32',port:55440,installation,safe:true,...patch}],rowCount:1};if(text.includes('FROM saas.lock_authorization'))return {rows:patch.denied?[]:[{actor_id:actor,session_id:session}],rowCount:patch.denied?0:1};return {rows:[],rowCount:0,command:text==='COMMIT'?(patch.commit??'COMMIT'):undefined};}};
 return {database:createCompanyDatabase({connect:async()=>{connects++;return client;}},config),calls,releases,get connects(){return connects;}};
}
test('SaaS configuration accepts only explicitly selected new loopback target and fails closed elsewhere',()=>{
 const env={SAAS_BACKEND_ENABLED:'1',SAAS_DATABASE_APPROVED:'vtv_saas_dev',SAAS_DATABASE_URL:'postgresql://vtv_saas_runtime:synthetic@127.0.0.1:55440/vtv_saas_dev',SAAS_INSTALLATION_ID:installation};assert.ok(readSaasConfiguration(env));assert.equal(readSaasConfiguration({}),undefined);
 for(const patch of [{SAAS_DATABASE_APPROVED:undefined},{VERCEL:'1'},{SAAS_DATABASE_URL:env.SAAS_DATABASE_URL.replace('55440','55439')},{SAAS_DATABASE_URL:env.SAAS_DATABASE_URL.replace('vtv_saas_dev','vtv_web_auth_test')},{SAAS_DATABASE_URL:env.SAAS_DATABASE_URL.replace('127.0.0.1','production.invalid')},{SAAS_DATABASE_URL:env.SAAS_DATABASE_URL+'?sslmode=disable'},{SAAS_DATABASE_URL:env.SAAS_DATABASE_URL.replace('vtv_saas_runtime','postgres')},{SAAS_INSTALLATION_ID:'bad'}])assert.equal(readSaasConfiguration({...env,...patch}),undefined);
});
test('existing authentication target stays valid; new identity target requires both explicit local selectors',()=>{
 const {readWebAuthConfig}=loadSource('lib/server/web-auth/config');const env={WEB_AUTH_ENABLED:'1',WEB_AUTH_ENV:'test',WEB_AUTH_ORIGIN:'https://localhost:3444',WEB_AUTH_DATABASE_URL:'postgresql://vtv_web_runtime:synthetic@127.0.0.1:55440/vtv_saas_dev',WEB_AUTH_DATABASE_NAME:'vtv_saas_dev',WEB_AUTH_INSTALLATION_ID:installation,WEB_AUTH_CSRF_SECRET:'a'.repeat(64),WEB_AUTH_OUTBOX_KEY:'b'.repeat(64)};
 assert.equal(readWebAuthConfig(env),undefined);assert.equal(readWebAuthConfig({...env,WEB_AUTH_LOCAL_DATABASE_APPROVED:'vtv_saas_dev'}),undefined);assert.ok(readWebAuthConfig({...env,WEB_AUTH_LOCAL_DATABASE_APPROVED:'vtv_saas_dev',SAAS_DATABASE_APPROVED:'vtv_saas_dev'}));
});
test('tenant transaction binds only hashed cookie and selected company, then checks live locked authorization',async()=>{
 const f=fixture();let saved;const result=await f.database.scoped(scope,async tx=>{saved=tx;assert.equal(tx.actorId,actor);assert.equal(tx.sessionId,session);await tx.query('SELECT $1',["'; DROP TABLE documents; --"]);return 'committed';});assert.equal(result,'committed');assert.equal(f.calls.at(-1).text,'COMMIT');assert.deepEqual(f.releases,[false]);const bound=f.calls.find(c=>c.text.includes('set_config'));const expectedHash=crypto.createHash('sha256').update(cookie).digest('hex');assert.ok(bound.text.includes(expectedHash));assert.ok(bound.text.includes(company));assert.ok(bound.text.includes('documents:write'));assert.ok(bound.text.includes('saas.lock_authorization'));assert.ok(!JSON.stringify(f.calls).includes(cookie));await assert.rejects(saved.query('SELECT 1'),{status:503});
});
test('bad session/selector/capability fail before a connection; removed membership denies before commands',async()=>{
 const f=fixture();await assert.rejects(f.database.scoped({...scope,sessionCookie:'fake'},async()=>{}),{status:401});await assert.rejects(f.database.scoped({...scope,companyId:'forged'},async()=>{}),{status:400});await assert.rejects(f.database.scoped({...scope,permission:'software_administrator'},async()=>{}),{status:403});assert.equal(f.connects,0);const denied=fixture({denied:true});let wrote=false;await assert.rejects(denied.database.scoped(scope,async()=>{wrote=true;}),{status:403});assert.equal(wrote,false);assert.equal(denied.calls.at(-1).text,'ROLLBACK');
});
test('unsafe role, fingerprint, port and database deny before BEGIN (injected database transport)',async()=>{
 for(const patch of [{role:'postgres'},{session_role:'owner'},{database:'vtv_web_auth_test'},{port:55439},{installation:id()},{address:'10.1.2.3/32'}]){const f=fixture(patch);await assert.rejects(f.database.scoped(scope,async()=>{}),{status:503});assert.ok(!f.calls.some(c=>c.text.startsWith('BEGIN')));assert.deepEqual(f.releases,[true]);}
});
test('swallowed query failures and pending/parallel queries cannot publish success',async()=>{
 const failed=fixture({},sql=>{if(sql==='FAIL')throw Error('private driver detail');});await assert.rejects(failed.database.scoped(scope,async tx=>{try{await tx.query('FAIL');}catch{}return 'false success';}),{status:503});assert.ok(!failed.calls.some(c=>c.text==='COMMIT'));
 const parallel=fixture({},async sql=>{if(sql==='SLOW')await new Promise(r=>setTimeout(r,10));});await assert.rejects(parallel.database.scoped(scope,tx=>Promise.all([tx.query('SLOW'),tx.query('OTHER')])),{status:503});assert.equal(parallel.calls.at(-1).text,'ROLLBACK');
 const pending=fixture({},async sql=>{if(sql==='SLOW')await new Promise(r=>setTimeout(r,10));});await assert.rejects(pending.database.scoped(scope,async tx=>{void tx.query('SLOW');}),{status:503});
});
test('failed or implicit-rollback COMMIT has no callback retry and releases a poisoned connection',async()=>{
 for(const f of [fixture({commit:'ROLLBACK'}),fixture({},sql=>{if(sql==='COMMIT')throw Error('uncertain transport');})]){let writes=0;await assert.rejects(f.database.scoped(scope,async()=>{writes++;return 'saved';}),{status:503});assert.equal(writes,1);assert.deepEqual(f.releases,[true]);}
});
test('procurement/inventory/read-only policy never confers software admin or financial approval',()=>{
 assert.ok(companyRolePermissions.Procurement.includes('procurement:write'));assert.ok(!companyRolePermissions.Procurement.includes('procurement:approve'));assert.ok(companyRolePermissions.Inventory.includes('inventory:receive'));assert.ok(!companyRolePermissions.Inventory.includes('inventory:adjust'));assert.ok(companyRolePermissions.Viewer.every(p=>p.endsWith(':read')));assert.ok(!companyRolePermissions.Admin.includes('billing:manage'));assert.equal(companyRolePermissions.software_administrator,undefined);assert.equal(new Set(companyPermissions).size,companyPermissions.length);
});
test('request boundary verifies session, same-origin CSRF and server-chosen capability before tenant transaction (injected stores)',async()=>{
 const {requireBusinessScope,withCompanyRequest}=loadSource('lib/server/saas/request-context');const c=loadSource('lib/server/web-auth/crypto');
 const principal={userId:actor,sessionId:session,tokenHash:c.tokenHash(cookie),roles:[],expiresAt:Date.now()+60000,fullName:'Synthetic'};
 const config={origin:'https://localhost:3444',csrfSecret:'a'.repeat(64)};let calls=0,rate=0;
 const services={auth:{config,store:{principal:async hash=>{assert.equal(hash,principal.tokenHash);return principal;},consume:async()=>{rate++;return {allowed:true,retryAfterSeconds:0};}}},database:{scoped:async(scope,operation)=>{calls++;assert.equal(scope.companyId,company);return operation({actorId:actor});}}};
 const csrf=c.csrfToken(config.csrfSecret,c.sessionBinding(config.csrfSecret,session,principal.tokenHash));
 const request=extra=>new Request(config.origin+'/api/future-business',{method:'POST',headers:{cookie:'__Host-vetthevat-session='+cookie,origin:config.origin,'sec-fetch-site':'same-origin','x-csrf-token':csrf,...extra}});
 await assert.rejects(requireBusinessScope(request(),company,'documents:write',undefined),{status:503});
 for(const patch of [{origin:'https://other.test'},{'sec-fetch-site':'cross-site'},{'x-csrf-token':'forged'},{cookie:'__Host-vetthevat-session='+cookie+'; __Host-vetthevat-session='+cookie}])await assert.rejects(withCompanyRequest(request(patch),company,'documents:write',services,async()=>{}));
 assert.equal(calls,0);assert.equal(await withCompanyRequest(request(),company,'documents:write',services,async tx=>tx.actorId),actor);assert.equal(calls,1);assert.equal(rate,1);
});
test('migration runner is checksum-bound and preview-only by default; financial handlers remain unwired',()=>{
 const manifest=JSON.parse(fs.readFileSync('database/migrations/saas/stage-a.manifest.json','utf8'));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(manifest.migration)).digest('hex'),manifest.sha256);
 assert.equal(manifest.target.port,55440);assert.equal(manifest.target.database,'vtv_saas_dev');assert.equal(manifest.existingRecordsAffected,false);
 const runner=fs.readFileSync('scripts/saas-dev-migration.cjs','utf8');assert.ok(runner.includes("process.env.SAAS_MIGRATION_APPROVAL!==hash"));assert.ok(runner.includes("function assertFreshState(target=directory){if(fs.existsSync(target))throw"));assert.ok(runner.includes("assertFreshState();"));assert.ok(runner.includes('stage-a-before.dump'));assert.ok(runner.includes('stage-a-before-roles.sql'));assert.ok(!runner.includes('DROP DATABASE'));assert.ok(!runner.includes('DROP SCHEMA'));
 assert.ok(fs.readFileSync('app/api/stage1/[...segments]/route.ts','utf8').includes('createStage1Api(undefined)'));
 assert.ok(!fs.readFileSync('proxy.ts','utf8').includes('/api/saas'));
});
test('approved correction keeps FORCE RLS and application grants intact and rejects repeat execution',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/002_stage_a_authorization_locks.review.sql','utf8');
 assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),'082079c74f4788fa5724a30f86a443c46ed0179c8c0329c756a9323a690d80fd');
 await require('libpg-query').parse(sql);assert.equal((sql.match(/CREATE POLICY owner_authorization_lock/g)||[]).length,2);
 assert.equal((sql.match(/FOR UPDATE TO vtv_saas_owner USING\(true\) WITH CHECK\(false\)/g)||[]).length,2);
 assert.ok(sql.includes('Corrective migration already applied'));assert.ok(!/DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY|GRANT /i.test(sql));
});
test('account HTTP rejects missing configuration, ambiguous company selectors and unsupported methods',async()=>{
 const {companyAccountHandler}=loadSource('lib/server/saas/account-http');const base='https://localhost:3444/api/account/company-context';
 assert.equal((await companyAccountHandler(new Request(base),undefined)).status,503);
 for(const query of ['?companyId='+company+'&companyId='+company,'?companyId='+company+'&role=Owner',''])assert.equal((await companyAccountHandler(new Request(base+query),{})).status,400);
 assert.equal((await companyAccountHandler(new Request(base,{method:'POST'}),{})).status,405);
});
test('private storage config cannot discover production credentials or remote endpoints',()=>{
 const env={SAAS_OBJECT_STORAGE_ENABLED:'1',SAAS_OBJECT_STORAGE_APPROVED:'vtv-saas-dev-private',SAAS_OBJECT_ENDPOINT:'http://127.0.0.1:59000',SAAS_OBJECT_BUCKET:'vtv-saas-dev-private',SAAS_OBJECT_REGION:'us-east-1',SAAS_OBJECT_ACCESS_KEY:'synthetic',SAAS_OBJECT_SECRET_KEY:'synthetic-secret-unused'};assert.ok(readPrivateS3Configuration(env));for(const patch of [{VERCEL:'1'},{SAAS_OBJECT_STORAGE_APPROVED:undefined},{SAAS_OBJECT_ENDPOINT:'https://s3.amazonaws.com'},{SAAS_OBJECT_ACCESS_KEY:undefined},{SAAS_OBJECT_SECRET_KEY:undefined},{SAAS_OBJECT_BUCKET:'production'}])assert.equal(readPrivateS3Configuration({...env,...patch}),undefined);assert.equal(readPrivateS3Configuration({AWS_ACCESS_KEY_ID:'synthetic',AWS_SECRET_ACCESS_KEY:'synthetic'}),undefined);
});
function storageFixture(overrides={}){
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),documentId=id();const requests=[];const client={send:async(command)=>{requests.push(command);const name=command.constructor.name;if(overrides[name])return overrides[name](command);if(name==='GetBucketVersioningCommand')return {Status:'Enabled'};if(name==='GetBucketAclCommand')return {Owner:{ID:'private-owner'},Grants:[{Grantee:{Type:'CanonicalUser',ID:'private-owner'}}]};if(name==='GetBucketPolicyCommand')throw Object.assign(Error('No policy'),{name:'NoSuchBucketPolicy'});if(name==='PutObjectCommand')return {VersionId:'immutable-v1'};if(name==='GetObjectCommand')return {VersionId:'immutable-v1',ContentLength:bytes.length,Metadata:{sha256},Body:(async function*(){yield bytes;})()};}};
 return {bytes,sha256,documentId,requests,store:privateS3Store({bucket:'vtv-saas-dev-private'},client)};
}
test('real SDK command adapter uses versioned immutable private keys and validates bytes (injected S3 transport)',async()=>{
 const f=storageFixture(),original=await f.store.put({companyId:company,documentId:f.documentId,mime:'image/png',bytes:f.bytes});assert.equal(original.key,originalKey(company,f.documentId,f.sha256));const put=f.requests.find(c=>c.constructor.name==='PutObjectCommand');assert.equal(put.input.IfNoneMatch,'*');assert.equal(put.input.ACL,undefined);assert.deepEqual(await f.store.read(original),f.bytes);assert.equal(f.requests.find(c=>c.constructor.name==='GetObjectCommand').input.VersionId,'immutable-v1');
});
test('private adapter refuses public ACLs, any bucket policy, missing versioning, corrupt and oversized originals',async()=>{
 for(const patch of [{GetBucketVersioningCommand:()=>({Status:'Suspended'})},{GetBucketAclCommand:()=>({Owner:{ID:'owner'},Grants:[{Grantee:{Type:'Group',URI:'all-users'}}]})},{GetBucketPolicyCommand:()=>({Policy:'{}'})},{PutObjectCommand:()=>({VersionId:'null'})}]){const f=storageFixture(patch);await assert.rejects(f.store.put({companyId:company,documentId:f.documentId,mime:'image/png',bytes:f.bytes}),{status:503});}
 for(const body of [Buffer.from('corrupt!!'),Buffer.alloc(20)]){const f=storageFixture({GetObjectCommand:()=>({VersionId:'immutable-v1',ContentLength:9,Metadata:{sha256:f.sha256},Body:(async function*(){yield body;})()})});await assert.rejects(f.store.read({key:originalKey(company,f.documentId,f.sha256),version:'immutable-v1',sha256:f.sha256,byteSize:9}),{status:503});}
});
test('unconfigured document storage refuses before database writes; quarantined originals cannot be downloaded',async()=>{
 const {documentWorkflow}=loadSource('lib/server/saas/documents');let writes=0;const database={scoped:async(scope,fn)=>{writes++;return fn({companyId:company,actorId:actor,query:async()=>({rows:[]})});}};await assert.rejects(documentWorkflow(database,undefined).intake(scope,{},'a'.repeat(20)),{status:503});assert.equal(writes,0);let read=false;await assert.rejects(documentWorkflow(database,{read:async()=>{read=true;}}).download(scope,id()),{status:404});assert.equal(read,false);
});
test('document list and status use the authorized company scope; download activation remains behind the isolated Stage B gate',async()=>{
 const documentId=id(),{documentWorkflow}=loadSource('lib/server/saas/documents');const calls=[],database={scoped:async(bound,operation)=>{assert.equal(bound.companyId,company);assert.equal(bound.permission,'documents:read');return operation({companyId:company,actorId:actor,query:async(sql,values)=>{calls.push({sql,values});return {rows:[{id:documentId,original_name:'invoice.pdf',state:'quarantined',inspection:null,extraction:null}]};}});}};
 const workflow=documentWorkflow(database,undefined),listing=await workflow.list({...scope,permission:undefined},new URLSearchParams());assert.equal(listing.items[0].state,'quarantined');assert.match(calls[0].sql,/WHERE d\.company_id=\$1/);assert.ok(!calls[0].sql.includes('object_key'));
 const status=await workflow.status({...scope,permission:undefined},documentId);assert.equal(status.id,documentId);assert.deepEqual(calls[1].values,[company,documentId]);
 const {manualInvoicePath}=loadSource('lib/server/saas/manual-activation');assert.equal(manualInvoicePath('/api/business/documents'),true);assert.equal(manualInvoicePath(`/api/business/documents/${documentId}/status`),true);assert.equal(manualInvoicePath(`/api/business/invoices/${documentId}/attachments`),true);assert.equal(manualInvoicePath(`/api/business/banking/transactions/${documentId}/category`),true);assert.equal(manualInvoicePath('/api/business/documents/not-a-uuid/status'),false);
});
test('document intake preserves a durable reservation across storage failure and reuses its original ID on retry (injected SQL/storage)',async()=>{
 const {documentWorkflow}=loadSource('lib/server/saas/documents');let state={document:null,keys:{},jobs:0},failStorage=true;const uploaded=[];
 const database={scoped:async(scope,operation)=>{const draft=structuredClone(state);const query=async(sql,v)=>{
  if(sql.startsWith('INSERT INTO saas.idempotency_keys'))draft.keys[v[2]]??={payload_hash:v[3],response:null};
  if(sql.startsWith('SELECT payload_hash'))return {rows:[draft.keys[v[2]]],rowCount:1};
  if(sql.startsWith('SELECT id::text,state'))return {rows:draft.document?[{id:draft.document.id,state:draft.document.state}]:[],rowCount:draft.document?1:0};
  if(sql.startsWith('INSERT INTO saas.documents'))draft.document={id:v[0],sha256:v[5],state:'awaiting_upload',object_version:null};
  if(sql.startsWith('SELECT state,object_version'))return {rows:draft.document?[draft.document]:[],rowCount:1};
  if(sql.startsWith('UPDATE saas.documents')){draft.document.state='quarantined';draft.document.object_version=v[2];}
  if(sql.startsWith('INSERT INTO saas.document_jobs'))draft.jobs=1;
  if(sql.startsWith('UPDATE saas.idempotency_keys'))draft.keys[v[2]].response=JSON.parse(v[3]);
  return {rows:[],rowCount:1};
 };const result=await operation({companyId:company,actorId:actor,sessionId:session,query});state=draft;return result;}};
 const bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const storage={put:async input=>{uploaded.push(input.documentId);if(failStorage)throw Error('simulated storage outage');return {key:originalKey(company,input.documentId,sha256),sha256,byteSize:bytes.length,version:'retained-version'};}};
 const workflow=documentWorkflow(database,storage),upload={bytes,sha256,byteSize:bytes.length,mimeType:'image/png',originalName:"' invoice.png"},key='stable-upload-reference';
 await assert.rejects(workflow.intake(scope,upload,key));assert.equal(state.document.state,'awaiting_upload');assert.equal(state.jobs,0);const reservedId=state.document.id;
 failStorage=false;const result=await workflow.intake(scope,upload,key);assert.equal(result.id,reservedId);assert.equal(result.state,'quarantined');assert.equal(state.jobs,1);assert.deepEqual(uploaded,[reservedId,reservedId]);assert.ok(!JSON.stringify(result).includes('companies/'));
 await workflow.intake(scope,upload,key);assert.equal(uploaded.length,2,'committed idempotent replay performs no object write');
 await assert.rejects(workflow.intake(scope,{...upload,originalName:'different.png'},key),{status:409});assert.equal(uploaded.length,2);
});
test('candidate SQL parses with PostgreSQL 17 grammar but is not executed; lookups and isolation controls present',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/001_saas_foundation.review.sql','utf8'),{parse}=require('libpg-query');const ast=await parse(sql);assert.ok(ast.version>=170000&&ast.version<180000);assert.ok(ast.stmts.length>90);assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);assert.ok(sql.includes("current_database()<>'vtv_saas_dev'"));assert.ok(sql.includes('inet_server_port()<>55440'));assert.ok(!sql.includes('firebase'));assert.ok(sql.includes('FOR SHARE OF s,u,m,c,cp,a,r,rp,p'));assert.ok(sql.includes('FORCE ROW LEVEL SECURITY'));assert.ok(!/GRANT\s+DELETE.*TO vtv_saas_runtime/.test(sql));assert.ok(!/GRANT.*ON web_auth\..*TO vtv_saas_runtime/.test(sql));for(const [role,permissions] of Object.entries(companyRolePermissions))for(const p of permissions)assert.ok(sql.includes(`('${role}','${p}')`));
 // SQL-language bodies are parsed separately. PL/pgSQL/catalog/grant/RLS behavior
 // still requires an explicitly approved real migration + integration run.
 for(const match of sql.matchAll(/LANGUAGE sql[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g))await parse(match[1]);
});

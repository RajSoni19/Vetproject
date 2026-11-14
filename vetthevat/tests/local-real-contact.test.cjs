const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {loadSource}=require('./load-source.cjs'),{validateContact}=loadSource('lib/contact-contracts'),{contactHandler}=loadSource('lib/server/contact');
const payload={fullName:'Example Person',businessName:'Example Business',email:'PERSON@example.test',category:'VAT management',message:'Please discuss the services available.',consent:true};
test('contact contracts normalize required fields and reject recipient/ownership selectors',()=>{
 assert.equal(validateContact(payload).email,'person@example.test');
 for(const patch of [{recipient:'elsewhere@example.test'},{companyId:crypto.randomUUID()},{consent:false},{fullName:''},{message:'x'.repeat(5001)},{email:'invalid'},{category:'unknown'},{fullName:'\ufb03'.repeat(100)}])assert.throws(()=>validateContact({...payload,...patch}));
});
function fixture(){let writes=0;return {get writes(){return writes;},deps:{origin:'https://localhost:3444',secret:'s'.repeat(64),networkKey:()=> 'isolated-test',verifyBot:async()=>true,store:{consume:async()=>({allowed:true,retryAfter:0}),save:async()=>{writes++;return {id:crypto.randomUUID(),createdAt:new Date().toISOString()};}}}};}
const request=(body={},patch={})=>new Request('https://localhost:3444/api/public/contact',{method:'POST',headers:{origin:'https://localhost:3444','content-type':'application/json','idempotency-key':crypto.randomUUID(),...patch},body:JSON.stringify({...payload,website:'',turnstileToken:'injected-unit-token',...body})});
test('unconfigured public contact endpoint never reports a saved message',async()=>{const r=await contactHandler(undefined)(request());assert.equal(r.status,503);assert.notEqual((await r.json()).received,true);});
test('contact origin, bot and rate protection reject before durable save',async()=>{
 const f=fixture();assert.equal((await contactHandler(f.deps)(request({},{origin:'https://other.invalid'}))).status,403);assert.equal(f.writes,0);
 assert.equal((await contactHandler({...f.deps,verifyBot:async()=>false})(request())).status,400);assert.equal(f.writes,0);
 assert.equal((await contactHandler({...f.deps,store:{...f.deps.store,consume:async()=>({allowed:false,retryAfter:60})}})(request())).status,429);assert.equal(f.writes,0);
 assert.equal((await contactHandler(f.deps)(request({website:'bot.invalid'}))).status,400);assert.equal(f.writes,0);
});
test('durable contact store acknowledgment is required before success; failures are redacted',async()=>{
 const f=fixture(),response=await contactHandler(f.deps)(request());assert.equal(response.status,200);assert.equal((await response.json()).received,true);assert.equal(f.writes,1);
 const failed=await contactHandler({...f.deps,store:{...f.deps.store,save:async()=>{throw Error('private password database failure');}}})(request());assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private password'));
});
test('contact PostgreSQL adapter parameterizes payload and waits for transaction commit acknowledgment',async()=>{
 const {postgresContactStore}=loadSource('lib/server/contact-postgres');let committed=false,calls=[];const store=postgresContactStore({transaction:async fn=>{const r=await fn({query:async(sql,values)=>{calls.push({sql,values});return {rows:[{id:crypto.randomUUID(),created_at:new Date().toISOString()}]};}});committed=true;return r;}});
 await store.save({payload:{...payload,message:"'); DROP SCHEMA contact_intake CASCADE; --"},keyHash:'a'.repeat(64),digest:'b'.repeat(64),duplicateHash:'c'.repeat(64)});assert.equal(committed,true);assert.ok(!calls[0].sql.includes('DROP SCHEMA'));assert.ok(calls[0].values[0].includes('DROP SCHEMA'));
 const lost=postgresContactStore({transaction:async fn=>{await fn({query:async()=>({rows:[{id:crypto.randomUUID(),created_at:new Date().toISOString()}]})});throw Error('unknown COMMIT');}});await assert.rejects(lost.save({payload,keyHash:'a',digest:'b',duplicateHash:'c'}),/unknown COMMIT/);
});
test('contact challenge verification requires its own action and hostname; notification HTML is escaped',async()=>{
 const {contactBotVerifier,contactEmail}=loadSource('lib/server/contact-providers');const result={success:true,hostname:'localhost',action:'contact-enquiry',challenge_ts:new Date().toISOString()};
 assert.equal(await contactBotVerifier('injected','localhost',async()=>Response.json(result))('token','request'),true);
 assert.equal(await contactBotVerifier('injected','localhost',async()=>Response.json({...result,action:'lead-enquiry'}))('token','request'),false);
 assert.equal(await contactBotVerifier('injected','localhost',async()=>Response.json({...result,hostname:'other.invalid'}))('token','request'),false);
 const email=contactEmail({...payload,message:'<script>unsafe</script>'},crypto.randomUUID(),new Date().toISOString(),'verified@example.test');assert.ok(!email.html.includes('<script>'));assert.ok(email.html.includes('&lt;script&gt;'));assert.deepEqual(email.to,['admin@vetthevat.com']);
});
test('local entry redirects only safe read requests to the fixed HTTPS origin',async()=>{
 const {localEntry}=require('../scripts/local-entry.cjs'),server=localEntry('synthetic-build');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();
 try{const http=require('node:http'),read=(path,method='GET')=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:address.port,path,method,headers:{host:'localhost:3000'}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,headers:res.headers}));});r.on('error',reject);r.end();});
  const r=await read('/login?expired=1');assert.equal(r.status,307);assert.equal(r.headers.location,'https://localhost:3444/login?expired=1');assert.equal((await read('//evil.invalid/login')).status,400);assert.equal((await read('/api/auth/session','POST')).status,405);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('contact migration parses offline and grants no table/list access to public/runtime',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/004_public_contact.review.sql','utf8'),{parse}=require('libpg-query');await parse(sql);assert.ok(sql.includes('FORCE ROW LEVEL SECURITY'));assert.ok(!/GRANT (?:SELECT|INSERT|UPDATE|DELETE).*ON .*contact_intake\./.test(sql));assert.ok(sql.includes('vtv_saas_dev'));assert.ok(sql.includes('55440'));assert.ok(!/placeholder|firebase|55439/.test(sql));
});

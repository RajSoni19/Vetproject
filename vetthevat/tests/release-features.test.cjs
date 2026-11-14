const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {loadSource}=require('./load-source.cjs');
test('report filters reject duplicate, unknown, mixed-currency and export cursor selectors',()=>{
 const {reportFilters}=loadSource('lib/server/saas/reports'),base={startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'};
 assert.equal(reportFilters(new URLSearchParams(base)).status,'confirmed');
 for(const patch of [{companyId:crypto.randomUUID()},{status:'all'},{direction:'invalid'},{currency:'GBP,EUR'},{format:'csv'},{format:'xlsx',after:crypto.randomUUID()}])assert.throws(()=>reportFilters(new URLSearchParams({...base,...patch})),{status:400});
 const duplicate=new URLSearchParams(base);duplicate.append('currency','EUR');assert.throws(()=>reportFilters(duplicate),{status:400});
});
test('support payloads reject ownership/recipient selectors and require bounded normalized messages',()=>{
 const {supportInput}=loadSource('lib/server/saas/support');assert.deepEqual(supportInput('reply',{body:' A message '}),{body:'A message'});
 for(const [action,payload] of [['create',{subject:'Hi',category:'Other',body:'Help',recipient:'someone@example.test'}],['reply',{body:''}],['reply',{body:'x'.repeat(5001)}],['state',{state:'deleted'}],['promote',{role:'Owner'}]])assert.throws(()=>supportInput(action,payload),{status:400});
});
test('administrator overview repeats the live grant check and never returns credentials',async()=>{
 const {administratorOverview}=loadSource('lib/server/admin-overview'),p={roles:['software_administrator'],userId:crypto.randomUUID(),tokenHash:'a'.repeat(64)},queries=[];
 const keys=['PLATFORM_ADMIN_ENABLED','PLATFORM_ADMIN_SCHEMA_SHA256'],before=keys.map(k=>process.env[k]);
 try{
  delete process.env.PLATFORM_ADMIN_ENABLED;
  await assert.rejects(administratorOverview({},p,new URLSearchParams()),{status:503});
  process.env.PLATFORM_ADMIN_ENABLED='1';process.env.PLATFORM_ADMIN_SCHEMA_SHA256=loadSource('lib/server/platform-admin').platformSchemaSha256;
  await assert.rejects(administratorOverview({store:{transaction:async fn=>fn({query:async sql=>{queries.push(sql);throw Object.assign(Error('MFA required'),{code:'42501'});}})}},p,new URLSearchParams()),{status:403});assert.equal(queries.length,1);assert.ok(queries[0].includes('platform_admin.read'));
  await assert.rejects(administratorOverview({}, {...p,roles:[]},new URLSearchParams()),{status:403});
 }finally{keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];});}
});
test('contact notification uncertain database acknowledgement never takes the send-failure retry path',async()=>{
 const {processContactNotice}=loadSource('lib/server/contact-notifications'),job={id:crypto.randomUUID(),lease:crypto.randomUUID(),enquiryId:crypto.randomUUID(),createdAt:new Date().toISOString(),payload:{fullName:'Test Person',businessName:'Example Test',email:'test@example.test',category:'Other',message:'Please help with a synthetic question.',consent:true}},calls=[];
 await assert.rejects(processContactNotice({claim:async()=>job,finish:async(j,id,failed)=>{calls.push(failed);throw Error('uncertain commit');}},{send:async()=>({accepted:true,messageId:'synthetic-receipt'})},'sink@example.test',new AbortController().signal),/uncertain commit/);
 assert.deepEqual(calls,[false]);
});
test('review candidate checksums match disabled activation constants and SQL parses offline',async()=>{
 const sqls=[['022_support_workflows.review.sql',loadSource('lib/server/saas/support').supportSchemaSha256],['023_contact_notification_worker.review.sql',loadSource('lib/server/contact-config').contactWorkerSchemaSha256]],parser=require('libpg-query');
 for(const [file,hash] of sqls){const sql=fs.readFileSync('database/migrations/saas/'+file,'utf8');assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),hash);await parser.parse(sql);assert.ok(sql.includes("inet_server_port()<>55440"));}
});

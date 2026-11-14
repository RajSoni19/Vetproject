const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createHmac, randomUUID } = require('node:crypto');
const { loadSource } = require('./load-source.cjs');
const { ApiError } = loadSource('lib/server/api-v1');
const { authorizeRequest, redisRateLimiter } = loadSource('lib/server/stage1/security');
const { createStage1Api } = loadSource('lib/server/stage1/http');
const { createRepositories, consumeInvoiceQuota, idempotent } = loadSource('lib/server/stage1/repositories');
const { boundedUpload, documentService } = loadSource('lib/server/stage1/documents');
const { parseExtraction, extractOriginal, extractionJobs } = loadSource('lib/server/stage1/extraction');
const { previewLegacyImport } = loadSource('lib/server/stage1/legacy-import');
const { contactCommand, invoiceCommand, scopedFilters } = loadSource('lib/server/business-contracts');
const ids = { company: randomUUID(), other: randomUUID(), account: randomUUID(), user: randomUUID(), invoice: randomUUID() };
const secret = 's'.repeat(64), binding = 'b'.repeat(64), origin = 'https://fixture.example.test';
function security(overrides = {}) {
  const events = [];
  const deps = { origin, csrfSecret: secret,
    sessions: { verifySession: async () => ({ userId: ids.user, sessionId: randomUUID(), revoked: false, expiresAt: Date.now()+60000 }) },
    registry: { active: async () => ({ csrfBinding: binding, expiresAt: Date.now()+60000 }) },
    memberships: { resolve: async (_, companyId) => companyId === ids.company ? ({ userId: ids.user, billingAccountId: ids.account, companyId, active: true, capabilities: ['contacts:read','contacts:write','invoices:read','invoices:write','documents:read','documents:write','banking:write'] }) : null },
    limiter: { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, audit: { append: async event => events.push(event) }, ...overrides };
  return { deps, events };
}
function request(method='GET', body, extra={}) {
  return new Request(origin+'/api/stage1/companies/'+ids.company+'/customers', { method, headers: { cookie: '__Host-vetthevat-session=verified-cookie', origin, 'sec-fetch-site':'same-origin', 'x-csrf-token':createHmac('sha256',secret).update(binding).digest('hex'), 'content-type':'application/json', ...extra }, ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}) });
}
async function access(capability='contacts:read') { return authorizeRequest(request(capability.endsWith('write')?'POST':'GET'),ids.company,capability,security().deps); }

test('Stage 1: login setup stays reachable while private routes and unwired APIs remain denied',async()=>{
  const {privateRouteDecision}=loadSource('lib/server/private-routing');
  const deny=async()=>{throw Error('No configured provider')};
  for(const mode of [false,true])assert.equal((await privateRouteDecision(new Request(origin+'/login'),mode,deny)).kind,'setup');
  assert.equal((await privateRouteDecision(new Request(origin+'/app/ors'),false,deny)).kind,'login');
  assert.equal((await privateRouteDecision(new Request(origin+'/api/stage1/test'),false,deny)).status,401);
  assert.equal((await privateRouteDecision(new Request(origin+'/app/ors'),true,deny)).status,404);
});

test('Stage 1: default handler has no auth/database side effects and stays unavailable', async () => {
  const response = await createStage1Api(undefined)(request(), []); assert.equal(response.status,503); assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Stage 1: membership is resolved from verified identity; cross-company and missing capability denied', async () => {
  const {deps,events}=security();
  assert.equal((await authorizeRequest(request(),ids.company,'contacts:read',deps)).billingAccountId,ids.account);
  await assert.rejects(authorizeRequest(request(),ids.other,'contacts:read',deps), e=>e.status===403);
  await assert.rejects(authorizeRequest(request(),ids.company,'billing:manage',deps), e=>e.status===403);
  assert.deepEqual(events.map(row=>row.event),['access.allowed','access.denied','access.denied']);
  assert.ok(!JSON.stringify(events).includes('verified-cookie'));
});
test('Stage 1: forged/missing/revoked/expired sessions and duplicate cookies denied', async () => {
  const configurations = [security({sessions:{verifySession:async()=>{throw Error('secret')}}}).deps, security({registry:{active:async()=>null}}).deps, security({sessions:{verifySession:async()=>({userId:ids.user,sessionId:randomUUID(),revoked:true,expiresAt:Date.now()+1000})}}).deps];
  for(const deps of configurations) await assert.rejects(authorizeRequest(request(),ids.company,'contacts:read',deps), e=>e.status===401);
  for(const cookie of ['', '__Host-vetthevat-session=a; __Host-vetthevat-session=b']) await assert.rejects(authorizeRequest(request('GET',undefined,{cookie}),ids.company,'contacts:read',security().deps),e=>e.status===401);
});
test('Stage 1: CSRF/origin checks precede business writes', async () => {
  for(const headers of [{'x-csrf-token':'bad'},{origin:'https://attacker.example'},{'sec-fetch-site':'cross-site'}]) await assert.rejects(authorizeRequest(request('POST',{},headers),ids.company,'contacts:write',security().deps),e=>e.status===403);
  assert.equal((await access('contacts:write')).userId,ids.user);
});
test('Stage 1: rate store failure denies access; rate denial returns Retry-After', async () => {
  const deps=security({limiter:{consume:async()=>({allowed:false,retryAfterSeconds:9})}}).deps;
  const handler=createStage1Api({security:deps}); const response=await handler(request(),['companies',ids.company,'customers']);
  assert.equal(response.status,429); assert.equal(response.headers.get('retry-after'),'9');
});
test('Stage 1: Redis adapter uses one atomic EVAL and opaque same-slot keys', async () => {
  let capture; const limiter=redisRateLimiter({eval:async(...args)=>{capture=args;return [1,0]}},secret);
  await limiter.consume([{key:'sensitive-identity',limit:3,windowMs:1000},{key:'tenant',limit:5,windowMs:2000}]);
  assert.equal(capture[1].length,2); assert.ok(capture[1].every(key=>key.startsWith('{vet-stage1}:rate:'))); assert.ok(!JSON.stringify(capture[1]).includes('sensitive'));
});
test('Stage 1: scoped DAL binds broker ticket and company before parameterized queries', async () => {
  const queries=[]; let brokerInput;
  const tx={query:async(sql,values)=>{queries.push({sql,values});return {rows:sql.includes('pg_backend_pid')?[{pid:77,transaction_id:'123'}]:sql.includes('authorized_company')?[{allowed:true}]:[],rowCount:0}}};
  const repos=createRepositories({transaction:work=>work(tx)},{issue:async input=>{brokerInput=input;return {ticket:'x'.repeat(43)}}});
  const principal=await access(); await repos.listContacts(principal,'customers',scopedFilters(new URLSearchParams('query=%27%3BDROP')));
  assert.equal(brokerInput.companyId,ids.company); assert.equal(brokerInput.backendPid,77);
  assert.ok(queries[1].sql.includes("set_config('app.context_ticket',$1,true)"));
  const query=queries.at(-1);assert.equal(query.values[0],ids.company);assert.ok(!query.sql.includes("';DROP"));
  await assert.rejects(async()=>repos.listContacts({...principal,capability:'invoices:read'},'customers',scopedFilters(new URLSearchParams())),e=>e.status===403);
});
test('Stage 1: broker refusal cannot reach a business query', async () => {
  const queries=[]; const repos=createRepositories({transaction:work=>work({query:async sql=>{queries.push(sql);return {rows:[{pid:1,transaction_id:'2'}]}}})},{issue:async()=>{throw Error()}});
  await assert.rejects(repos.listContacts(await access(),'suppliers',scopedFilters(new URLSearchParams())),e=>e.status===403);assert.equal(queries.length,1);
});
test('Stage 1: API rejects client roles/plans, validates commands and paginates', async () => {
  let called=0; const handler=createStage1Api({security:security().deps,repositories:{listContacts:async(_,kind,filter)=>{called++;return {kind,limit:filter.limit,items:[],nextCursor:null}},saveContact:async()=>{called++;return {}}}});
  let response=await handler(request(),['companies',ids.company,'customers']); assert.equal(response.status,200); assert.equal((await response.json()).data.limit,25);
  response=await handler(request('POST',{name:'Test',status:'Active',role:'Owner'},{'idempotency-key':'a'.repeat(16),'if-match':'"1"'}),['companies',ids.company,'customers']);assert.equal(response.status,400);assert.equal(called,1);
});
test('Stage 1: bounded upload accepts four formats and computes trusted digest', async () => {
  const fixtures=[['application/pdf',Buffer.from('%PDF-1.7\nsynthetic\n%%EOF')],['image/jpeg',Buffer.from([255,216,255,0])],['image/png',Buffer.from([137,80,78,71,13,10,26,10])],['image/webp',Buffer.from('RIFF0000WEBP')]];
  for(const [mime,bytes] of fixtures){const result=await boundedUpload(new Request(origin,{method:'POST',headers:{'content-type':mime,'x-file-name':'synthetic'},body:bytes}));assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));}
});
test('Stage 1: malformed uploads reject signatures, names, unsupported types, truncation and oversize streams', async () => {
  const cases=[['image/png','bad',{}],['application/pdf','%PDF-1.7 no end',{}],['text/html','bad',{}],['image/jpeg',Buffer.from([255,216,255]),{'x-file-name':'../secret'}],['image/png',new Uint8Array(10*1024*1024+1),{}]];
  for(const [mime,body,headers] of cases)await assert.rejects(boundedUpload(new Request(origin,{method:'POST',headers:{'content-type':mime,...headers},body})));
});
test('Stage 1: signature alone never bypasses mandatory content inspection or writes private files', async () => {
  let writes=0;const service=documentService({scoped:async()=>{writes++}}, {put:async()=>{writes++}}, {inspect:async()=>({clean:false,pages:1,maxPagePixels:10})});
  await assert.rejects(service.intake(await access('documents:write'),{bytes:new Uint8Array(),mimeType:'image/png'},'a'.repeat(16)),e=>e.status===400);assert.equal(writes,0);
});
test('Stage 1: idempotency returns committed result and rejects changed payload', async () => {
  const payload={x:1}, digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');let work=0;
  const tx={query:async sql=>({rows:sql.startsWith('SELECT')?[{payload_sha256:digest,response:{id:'already'}}]:[]})};
  assert.deepEqual(await idempotent(tx,await access(),'test','a'.repeat(16),payload,async()=>{work++}),{id:'already'});assert.equal(work,0);
  await assert.rejects(idempotent(tx,await access(),'test','a'.repeat(16),{x:2},async()=>{}),e=>e.status===409);
});

test('Stage 1: quota concurrency under a serialized transactional test double shares all companies', async () => {
  // NOT a PostgreSQL lock/RLS test. This double models an account lock and
  // rollback so the actual SQL command's allowance/count path is exercised.
  let tail=Promise.resolve(), committed=[];
  const database={transaction(work){const run=tail.then(async()=>{const pending=[];const tx={query:async(sql,values)=>{
    if(sql.includes('FROM vat.billing_accounts'))return {rows:[{id:ids.account}]};
    if(sql.includes('JOIN vat.subscriptions'))return {rows:[{id:ids.account,allowance:30,plan_snapshot:'Basic'}]};
    if(sql.startsWith('SELECT state'))return {rows:[]};
    if(sql.includes('account_invoice_usage'))return {rows:[{used:String(committed.length+pending.length)}]};
    if(sql.startsWith('INSERT INTO vat.invoice_usage')){pending.push(values);return {rows:[]}};
    throw Error(sql);
  }};const result=await work(tx);committed.push(...pending);return result;});tail=run.catch(()=>{});return run;}};
  const principal=await access('invoices:write');
  await assert.rejects(database.transaction(async tx=>{await consumeInvoiceQuota(tx,principal,randomUUID());throw Error('synthetic rollback after ledger insert')}));assert.equal(committed.length,0);
  const results=await Promise.allSettled(Array.from({length:60},(_,i)=>database.transaction(tx=>consumeInvoiceQuota(tx,{...principal,companyId:i%2?ids.company:ids.other},randomUUID()))));
  assert.equal(results.filter(row=>row.status==='fulfilled').length,30);assert.equal(committed.length,30);assert.equal(new Set(committed.map(row=>row[2])).size,2);
  await assert.rejects(database.transaction(async tx=>{await consumeInvoiceQuota(tx,principal,randomUUID());throw Error('rollback')}));assert.equal(committed.length,30);
});
test('Stage 1: editing an existing invoice saves revision and audit without consuming another allowance',async()=>{
 const principal=await access('invoices:write'),queries=[];let digest;
 const command=invoiceCommand({id:ids.invoice,currency:'GBP',action:'save-draft',lines:[]});
 const tx={query:async(sql,values)=>{queries.push(sql);
  if(sql.includes('pg_backend_pid'))return {rows:[{pid:7,transaction_id:'8'}]};
  if(sql.includes('authorized_company'))return {rows:[{allowed:true}]};
  if(sql.startsWith('INSERT INTO vat.idempotency_keys'))digest=values[4];
  if(sql.startsWith('SELECT payload_sha256'))return {rows:[{payload_sha256:digest,response:null}]};
  if(sql.startsWith('SELECT version'))return {rows:[{version:'1'}]};
  return {rows:[],rowCount:1};
 }};
 const repos=createRepositories({transaction:work=>work(tx)},{issue:async()=>({ticket:'x'.repeat(43)})});
 const result=await repos.saveInvoice(principal,command,{key:'a'.repeat(16),version:1});
 assert.equal(result.version,'2');assert.ok(queries.some(sql=>sql.startsWith('INSERT INTO vat.invoice_revisions')));assert.ok(queries.some(sql=>sql.startsWith('INSERT INTO vat.audit_events')));assert.ok(!queries.some(sql=>sql.includes('vat.invoice_usage')));
});
test('Stage 1: missing or overlapping billing periods fail closed',async()=>{
  for(const periods of [[],[{id:'one'},{id:'two'}]])await assert.rejects(consumeInvoiceQuota({query:async sql=>({rows:sql.includes('billing_accounts')?[{id:ids.account}]:periods})},await access('invoices:write'),randomUUID()),e=>e.status===503);
});
test('Stage 1: extraction keeps missing financial values null and preserves identical rows', () => {
  const empty=parseExtraction('Invoice number: TEST');assert.equal(empty.vat,null);assert.equal(empty.net,null);assert.deepEqual(empty.lines,[]);assert.equal(empty.reviewRequired,true);
  const text='Supplier: Fixture Ltd\nVAT number: GB123\nInvoice number: INV-1\nInvoice date: 2026-10-01\nDue date: 2026-10-30\nCurrency: GBP\nSubtotal: 20.00\nVAT amount: 0.00\nGrand total: 20.00\nItem | 1 | 10.00 | exempt | 10.00\nItem | 1 | 10.00 | exempt | 10.00';
  const result=parseExtraction(text,[{id:ids.user,name:'Fixture Ltd',vatNumber:'GB123'}]);assert.equal(result.supplierId,ids.user);assert.equal(result.lines.length,2);assert.equal(result.lines[0].taxClassification,'Exempt');assert.equal(result.lines[0].vatRate,'0');assert.equal(result.gross,'20.00');assert.equal(result.confidence,'Medium');
  const ambiguous=parseExtraction(text,[{id:ids.user,name:'A',vatNumber:'GB123'},{id:ids.other,name:'B',vatNumber:'GB123'}]);assert.equal(ambiguous.supplierId,null);assert.ok(ambiguous.warnings.includes('Ambiguous supplier identity.'));
  assert.ok(parseExtraction(text.replace('20.00\nItem','21.00\nItem')).warnings.includes('Source totals do not reconcile.'));
});
test('Stage 1: digital PDF, scanned PDF fallback, image OCR and cancellation use separate readers',async()=>{
  let pages=[];const readers={digitalPdf:async()=>({pages:2,textByPage:['A'.repeat(50),'']}),scannedPdfPage:async(_,page)=>{pages.push(page);return 'scanned'},image:async()=> 'image OCR'};
  assert.equal(await extractOriginal(new Uint8Array(),'application/pdf',readers,new AbortController().signal),'A'.repeat(50)+'\nscanned');assert.deepEqual(pages,[2]);
  assert.equal(await extractOriginal(new Uint8Array(),'image/webp',readers,new AbortController().signal),'image OCR');
  await assert.rejects(extractOriginal(new Uint8Array(),'image/png',readers,AbortSignal.abort()));
});
test('Stage 1: stale extraction lease cannot publish a result',async()=>{
  const queries=[];const jobs=extractionJobs({scoped:async(_,__,work)=>work({query:async(sql,values)=>{queries.push({sql,values});return {rows:[]}}})});
  await assert.rejects(jobs.finish(await access('documents:write'),randomUUID(),randomUUID(),parseExtraction('')),e=>e.status===409);
  assert.match(queries[0].sql,/lease_token=\$3/);assert.match(queries[0].sql,/lease_until>now\(\)/);
});
test('Stage 1: legacy import is preview-only and refuses privileged browser fields',()=>{
  const result=previewLegacyImport({customers:[{name:'Fixture',status:'Active'},{name:'Unsafe',status:'Active',role:'Owner'}]});assert.equal(result.previewOnly,true);assert.equal(result.valid.customers.length,1);assert.equal(result.problems.length,1);assert.equal(result.originalsTransferred,false);
  assert.throws(()=>previewLegacyImport({subscription:{plan:'Growth'}}));
});

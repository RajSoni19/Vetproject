// REAL PostgreSQL repository tests, runnable only AFTER separately approved 003.
// --preflight is read-only. No SQL migration, storage or scanner is started here.
const s=require('./saas-services.cjs'),{review}=require('../scripts/saas-stage-b-review.cjs');
const {assert,crypto,operator,application,provision,verify,login,companyFor,loadSource}=s;
async function run(){
 const target=await review();if(!target.stageBSchemaExists){console.log('BLOCKED: approved Stage B migration has not been executed; zero Stage B integration scenarios run.');process.exitCode=2;return;}
 if(process.argv.includes('--preflight')){console.log('Read-only preflight complete; no fixture writes requested.');return;}
 if(process.env.SAAS_STAGE_B_TEST_APPROVAL!==target.sha256)throw Error('Separate approved migration/test checksum selector required');
 const {database,pool}=s.business(),service=loadSource('lib/server/saas/invoices').invoiceService(database),results=[];
 const check=async(name,fn)=>{await fn();results.push({name,result:'passed'});console.log('REAL PASS '+name);};
 let a,b,sa,sb,ca,cb,party,record;
 const scope=(p='invoices:write',other=false)=>({sessionCookie:other?sb.token:sa.token,companyId:other?cb:ca,permission:p});
 const input=(number,patch={})=>({direction:'purchase',kind:'invoice',contactId:party.id,number,issuedOn:'2026-10-23',dueOn:null,currency:'GBP',rounding:'line-half-up',lines:[{description:'Disposable integration invoice',quantity:'2',unitPrice:'50',discount:'0',rate:'20',treatment:'standard',pricing:'exclusive'}],notes:null,creditForId:null,...patch});
 const key=()=>crypto.randomUUID();
 try{
 await check('live Stage B catalog, forced RLS and least-privilege grants',()=>operator(async db=>{
   const rows=(await db.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='business'::regnamespace AND relkind='r'")).rows;assert.equal(rows.length,23);for(const r of rows.filter(r=>r.relname!=='migrations'))assert.ok(r.relrowsecurity&&r.relforcerowsecurity);
   assert.deepEqual(rows.filter(r=>r.relname.startsWith('bank_')).map(r=>r.relname).sort(),['bank_accounts','bank_allocations','bank_imports','bank_reconciliation_events','bank_transaction_categories','bank_transactions'].sort());
   assert.equal((await db.query("SELECT has_function_privilege('vtv_saas_runtime','business.finish_inspection(uuid,uuid,text,text,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
   assert.equal((await db.query("SELECT has_table_privilege('vtv_saas_document_worker','business.invoices','SELECT') AS allowed")).rows[0].allowed,false);
 }));
 await check('fresh disposable verified HTTPS identities, sessions and company ownership',async()=>{a=await provision('stage-b-a');b=await provision('stage-b-b');await verify(a);await verify(b);sa=await login(a);sb=await login(b);ca=await companyFor(a.userId);cb=await companyFor(b.userId);});
 await check('real contacts persist and cross-company selectors are hidden by forced RLS',async()=>{
   party=await service.saveContact(scope('contacts:write'),{kind:'supplier',name:'Disposable supplier',status:'active'},key());
   assert.equal((await service.contacts(scope('contacts:read'),new URLSearchParams())).items.length,1);
   await database.scoped(scope('contacts:read',true),async tx=>assert.equal((await tx.query('SELECT id FROM business.counterparties WHERE id=$1',[party.id])).rowCount,0));
 });
 await check('missing verified entitlement rolls back invoice, history, usage and idempotency',async()=>{
   await assert.rejects(service.create(scope(),input('NO-ENTITLEMENT'),key()));
   await operator(async db=>assert.equal((await db.query('SELECT id FROM business.invoices WHERE company_id=$1',[ca])).rowCount,0));
   await operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Basic','active',30,2,2,90,false,now(),'disposable-test-fixture-not-a-payment' FROM saas.company_profiles WHERE company_id=$1",[ca]));
 });
 await check('invoice creation commits exact lines, revision, quota and audit only once',async()=>{
   const k=key();record=await service.create(scope(),input('LIVE-001'),k);assert.equal((await service.create(scope(),input('LIVE-001'),k)).id,record.id);
   const detail=await service.detail(scope('invoices:read'),record.id);assert.equal(detail.invoice.gross,'120.00');assert.equal(detail.lines.length,1);assert.equal(detail.history.length,1);
   await operator(async db=>{assert.equal((await db.query('SELECT id FROM business.invoice_usage WHERE company_id=$1 AND invoice_id=$2',[ca,record.id])).rowCount,1);assert.equal((await db.query("SELECT id FROM saas.audit_events WHERE company_id=$1 AND entity_id=$2 AND action='invoice.created'",[ca,record.id])).rowCount,1);});
 });
 await check('concurrent duplicate business identity commits one invoice',async()=>{
   const outcomes=await Promise.allSettled([service.create(scope(),input('LIVE-RACE'),key()),service.create(scope(),input('LIVE-RACE'),key())]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
   await operator(async db=>assert.equal((await db.query("SELECT id FROM business.invoices WHERE company_id=$1 AND number='LIVE-RACE'",[ca])).rowCount,1));
 });
 await check('cross-company invoice reads and foreign-key writes rejected',async()=>{
   await assert.rejects(service.detail(scope('invoices:read',true),record.id));await database.scoped(scope('invoices:read',true),async tx=>assert.equal((await tx.query('SELECT id FROM business.invoices WHERE id=$1',[record.id])).rowCount,0));
   await assert.rejects(service.create(scope('invoices:write',true),input('FOREIGN-CONTACT'),key()));
 });
 await check('review saves ordered lines, optimistic version rejects stale changes',async()=>{
   const saved=await service.replace(scope(),record.id,input('LIVE-001',{lines:[...input('X').lines,...input('X').lines]}),key(),1);assert.equal(saved.version,2);await assert.rejects(service.replace(scope(),record.id,input('LIVE-001'),key(),1),{status:409});
   assert.equal((await service.detail(scope('invoices:read'),record.id)).lines.length,2);
 });
 await check('confirmation is explicit, immutable and included in VAT report once',async()=>{
   const saved=await service.confirm(scope('invoices:confirm'),record.id,key(),2);assert.equal(saved.version,3);assert.equal(saved.state,'confirmed');await assert.rejects(service.replace(scope(),record.id,input('LIVE-001'),key(),3));
   const report=await service.vatReport(scope('reports:read'),{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});assert.equal(report.groups[0].vat,'40.00');assert.equal(report.groups[0].gross,'240.00');
 });
 await check('credit lineage and exact negative amounts reverse approved financial facts',async()=>{
   const credit=await service.create(scope('invoices:correct'),input('CREDIT-001',{kind:'credit-note',creditForId:record.id}),key());await service.confirm(scope('invoices:confirm'),credit.id,key(),1);
   const report=await service.vatReport(scope('reports:read'),{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});assert.equal(report.groups[0].vat,'20.00');
   await assert.rejects(service.create(scope('invoices:correct'),input('CREDIT-TOO-LARGE',{kind:'credit-note',creditForId:record.id,lines:[{...input('x').lines[0],quantity:'20'}]}),key()));
 });
 await check('SQL injection literal stays bound and membership revocation blocks reads',async()=>{
   await service.list(scope('invoices:read'),new URLSearchParams({query:"'; DROP SCHEMA business CASCADE; --"}));
   await operator(db=>db.query("UPDATE web_auth.company_memberships SET status='suspended' WHERE user_id=$1 AND company_id=$2",[a.userId,ca]));await assert.rejects(service.detail(scope('invoices:read'),record.id),{status:403});
 });
 await check('account-wide last invoice slot is serialized across concurrent commands',async()=>{
   await operator(db=>db.query("UPDATE web_auth.company_memberships SET status='active' WHERE user_id=$1 AND company_id=$2",[a.userId,ca]));
   const used=await operator(async db=>Number((await db.query("SELECT count(*) AS n FROM business.invoice_usage WHERE company_id=$1 AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date",[ca])).rows[0].n));
   for(let i=used;i<29;i++)await service.create(scope(),input('QUOTA-FILL-'+i),key());
   const outcomes=await Promise.allSettled([service.create(scope(),input('QUOTA-LAST-A'),key()),service.create(scope(),input('QUOTA-LAST-B'),key())]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
   await operator(async db=>assert.equal(Number((await db.query("SELECT count(*) AS n FROM business.invoice_usage WHERE company_id=$1 AND month=date_trunc('month',now() AT TIME ZONE 'UTC')::date",[ca])).rows[0].n),30));
 });
 await check('invoice and document HTTP scopes repeat authentication and company authorization',async()=>{const anonymous=await application('/api/business/invoices'),authorized=await application('/api/business/invoices',{cookie:sa.cookie,headers:{'x-company-id':ca}}),foreign=await application('/api/business/invoices',{cookie:sa.cookie,headers:{'x-company-id':cb}}),documents=await application('/api/business/documents',{cookie:sa.cookie,headers:{'x-company-id':ca}}),foreignDocuments=await application('/api/business/documents',{cookie:sa.cookie,headers:{'x-company-id':cb}});assert.equal(anonymous.status,401,'anonymous invoice list');assert.equal(authorized.status,200,'authorized invoice list');assert.equal(foreign.status,403,'foreign invoice company selector');assert.equal(documents.status,200,'authorized company document listing');assert.deepEqual(documents.body?.data?.items,[],'new test company has no seeded documents');assert.equal(foreignDocuments.status,403,'foreign document company selector');});
 }finally{await pool.end();s.fs.writeFileSync(s.path.join(s.root,'.master-stage-b/postgres-results.json'),JSON.stringify({at:new Date().toISOString(),results,passed:results.length,complete:results.length===13,storageOcrVerified:false},null,2));}
 console.log(`Real Stage B repository scenarios passed: ${results.length}; storage/OCR/browser financial acceptance remains separate.`);
}
run().catch(e=>{console.error('Stage B integration stopped: '+(e.name==='AssertionError'?e.message:(e.code||e.message)));process.exitCode=1;});

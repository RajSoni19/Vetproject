// Real PostgreSQL scenarios on the EXISTING approved local 55440 schema only.
// No schema creation, migration, external provider or protected cluster access.
const s=require('./saas-services.cjs'),fs=require('node:fs'),path=require('node:path');
async function run(){
 const target=await s.operator(async db=>(await db.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port")).rows[0]);
 s.assert.deepEqual(target,{db:'vtv_saas_dev',host:'127.0.0.1',port:55440});
 const user=await s.provisionVerifiedTestIdentity('release-reports'),session=await s.sessionForVerifiedTestIdentity(user),company=await s.companyFor(user.userId),foreign=await s.companyFor((await s.provisionVerifiedTestIdentity('release-report-foreign')).userId),business=s.business(),service=s.loadSource('lib/server/saas/invoices').invoiceService(business.database),reports=s.loadSource('lib/server/saas/reports').reportService(business.database),results=[];
 const scope=permission=>({sessionCookie:session.token,companyId:company,permission}),key=()=>s.crypto.randomUUID();
 const check=async(name,fn)=>{await fn();results.push({name,result:'passed'});console.log('REAL PASS '+name);};
 try{
 await s.operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Growth','active',300,3,6,NULL,true,now(),'synthetic-release-report-fixture-not-payment' FROM saas.company_profiles WHERE company_id=$1",[company]));
 const contact=await service.saveContact(scope('contacts:write'),{kind:'customer',name:'Report fixture customer',status:'active'},key());
 await check('contact detail reads PostgreSQL and denies foreign company/session selectors',async()=>{s.assert.equal((await service.contactDetail(scope('contacts:read'),contact.id)).name,'Report fixture customer');await s.assert.rejects(service.contactDetail({...scope('contacts:read'),companyId:foreign},contact.id),{status:403});});
 await check('sales drafts, confirmations and repeated commands retain existing VAT/idempotency rules',async()=>{
  for(let n=0;n<52;n++){
   const input={direction:'sale',kind:'invoice',contactId:contact.id,number:'REPORT-'+String(n).padStart(3,'0'),issuedOn:'2026-10-27',dueOn:null,currency:'GBP',rounding:'line-half-up',lines:[{description:'Synthetic report line',quantity:'1',unitPrice:'0.03',discount:'0',rate:'20',treatment:'standard',pricing:'exclusive'}],notes:null,creditForId:null},k=key(),record=await service.create(scope('invoices:write'),input,k);
   if(n===0){s.assert.equal((await service.create(scope('invoices:write'),input,k)).id,record.id);s.assert.equal((await service.detail(scope('invoices:read'),record.id)).invoice.issued_on,'2026-10-27');}
   if(n<51)await service.confirm(scope('invoices:confirm'),record.id,key(),record.version);
  }
 });
 const filters=new URLSearchParams({startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});
 await check('one database snapshot produces exact totals across two pages and excludes draft records',async()=>{
  const first=await reports.invoices(scope('reports:read'),filters),second=await reports.invoices(scope('reports:read'),new URLSearchParams([...filters,['after',first.after]]));
  s.assert.deepEqual([first.count,first.net,first.vat,first.gross],['51','1.53','0.51','2.04']);s.assert.equal(first.items.length,50);s.assert.equal(second.items.length,1);s.assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,51);s.assert.equal(second.after,null);
  s.assert.deepEqual([second.count,second.gross],['51','2.04']);
 });
 await check('filters, XLSX export data and tenant/role revocation use server records',async()=>{
  const query=new URLSearchParams(filters);query.set('query','REPORT-000');const row=await reports.invoices(scope('reports:read'),query);s.assert.equal(row.count,'1');s.assert.equal(row.gross,'0.04');
  query.delete('query');query.set('currency','EUR');s.assert.equal((await reports.invoices(scope('reports:read'),query)).count,'0');query.set('currency','GBP');query.set('format','xlsx');
  const report=await reports.invoices(scope('reports:export'),query),exported=s.loadSource('lib/server/saas/exports').exportReport(report,company,'xlsx'),XLSX=require('xlsx'),workbook=XLSX.read(exported.bytes,{type:'array'});s.assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Invoices).length,51);s.assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['Selection and totals'])[0].gross,'2.04');
  await s.assert.rejects(reports.invoices({...scope('reports:read'),companyId:foreign},filters),{status:403});
  await s.operator(db=>db.query("UPDATE web_auth.company_memberships SET role='Staff' WHERE company_id=$1 AND user_id=$2",[company,user.userId]));await s.assert.rejects(reports.invoices(scope('reports:read'),filters),{status:403});
 });
 fs.mkdirSync(path.resolve('.launch-acceptance'),{recursive:true});fs.writeFileSync(path.resolve('.launch-acceptance/release-reports-postgres.json'),JSON.stringify({at:new Date().toISOString(),target:'127.0.0.1:55440/vtv_saas_dev',schemaChanges:false,syntheticAllowance:true,providerAcceptance:false,results},null,2));
 }finally{await business.pool.end();}
}
run().catch(()=>{console.error('Release report PostgreSQL acceptance failed; inspect redacted assertions locally.');process.exitCode=1;});

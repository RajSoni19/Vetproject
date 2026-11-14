const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash,createHmac}=require('node:crypto');
const {loadSource}=require('./load-source.cjs');
const contracts=loadSource('lib/server/business-contracts');
const {resolvePlan}=loadSource('lib/server/entitlements');
const auth=loadSource('lib/server/auth-preparation');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const line={id:id(1),description:'Synthetic line',quantity:'1',unitPrice:'100',discount:'0',vatRate:'20',taxClassification:'Taxable'};
test('Basic/Starter/Growth limits and prices are explicit; missing/unverified plan never defaults',async()=>{
 for(const [plan,count,price,seats] of [['Basic',30,'9.00',2],['Starter',100,'15.00',4],['Growth',300,'25.00',6]]){
  const policy=resolvePlan(plan);assert.equal(policy.invoices,count);assert.equal(policy.monthlyPrice,price);assert.equal(policy.membersIncludingOwner,seats);
  let actual;await loadSource('lib/server/account-usage').reserveInvoiceAllowance({userId:id(1),companyId:id(2),invoiceId:id(3)},{resolve:async()=>({accountId:id(4),period:{start:'2026-10-01',end:'2026-11-01'},active:true,plan})},{reserve:async input=>{actual=input;return {allowed:true,used:1,reserved:0,reservationId:'synthetic'};}},Date.parse('2026-10-20'));assert.equal(actual.limit,count);
 }
 assert.equal(resolvePlan('Basic').orsOptionalMonthlyPrice,'5.00');assert.equal(resolvePlan('Growth').orsIncluded,true);assert.throws(()=>resolvePlan(undefined));assert.throws(()=>resolvePlan('Admin'));
});
test('server decimal arithmetic matches existing line policy and rejects client totals/overprecision/classification conflicts',()=>{
 const {calculateLine}=loadSource('lib/vat-calculations');
 for(const quantity of ['1','0.3333','2.5001'])for(const price of ['0.015','10.1234','100'])for(const rate of ['0','5','20']){
  const input={...line,quantity,unitPrice:price,vatRate:rate,taxClassification:undefined};const result=contracts.financialLine(input),existing=calculateLine({...input,quantity:Number(quantity),unitPrice:Number(price),discount:0,vatRate:Number(rate)});
  assert.equal(result.net,existing.netAmount.toFixed(2));assert.equal(result.vat,existing.vatAmount.toFixed(2));assert.equal(result.gross,existing.grossAmount.toFixed(2));assert.equal(result.taxClassification,undefined);
 }
 const input={id:id(5),invoiceNumber:'SYN-001',invoiceDate:'2026-10-20',currency:'GBP',supplierName:'Synthetic issuer',customerName:'Synthetic client',transactionType:'Sale',lines:[line,{...line,id:id(2)}],action:'confirm'};
 assert.equal(contracts.invoiceCommand(input).gross,'240.00');
 assert.throws(()=>contracts.invoiceCommand({...input,gross:'1.00'}));assert.throws(()=>contracts.invoiceCommand({...input,companyId:id(8)}));assert.throws(()=>contracts.invoiceCommand({...input,invoiceDate:'2026-02-30'}));
 assert.throws(()=>contracts.financialLine({...line,unitPrice:'1.00001'}));assert.throws(()=>contracts.financialLine({...line,quantity:'-1'}));assert.throws(()=>contracts.financialLine({...line,taxClassification:'Exempt'}));
  assert.equal(contracts.invoiceCommand({...input,action:'save-draft',invoiceDate:null,invoiceNumber:'',lines:[{...line,quantity:'0',description:''}]}).gross,'0.00');
  assert.throws(()=>contracts.invoiceCommand({...input,lines:[{...line,description:''}]}));
});
test('strict contacts, filters and upload bytes reject forged scope and invalid values',()=>{
 assert.throws(()=>contracts.contactCommand({name:'Synthetic',status:'Active',role:'Owner'}));
 assert.throws(()=>contracts.scopedFilters(new URLSearchParams('limit=25&limit=50')));assert.throws(()=>contracts.scopedFilters(new URLSearchParams('companyId='+id(1))));
 assert.equal(contracts.reportCommand({format:'xlsx',vatRate:'0'}).vatRate,'0');assert.throws(()=>contracts.reportCommand({format:'exe'}));
 const bytes=Buffer.from('%PDF-1.7\n synthetic'),sha256=createHash('sha256').update(bytes).digest('hex');
 const intent=contracts.uploadIntent({originalName:'synthetic.pdf',mimeType:'application/pdf',byteSize:bytes.length,sha256,purpose:'invoice'});
 assert.equal(contracts.verifyOriginalBytes(intent,bytes).sha256,sha256);assert.throws(()=>contracts.verifyOriginalBytes(intent,Buffer.from('not PDF')));
 assert.throws(()=>contracts.uploadIntent({...intent,originalName:'../secret.pdf'}));assert.throws(()=>contracts.uploadIntent({...intent,objectKey:'forged'}));
});
test('CSRF binds token to server-side session and same-origin request; principal resolution never trusts company mismatch',async()=>{
 const origin='https://vat.example.test',secret='synthetic-test-secret-only-'.repeat(2),binding='synthetic-session-binding',token=createHmac('sha256',secret).update(binding).digest('hex');
 const request=new Request(origin+'/api/v1/invoices',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','x-csrf-token':token}});
 auth.requireCsrf(request,origin,binding,secret);assert.throws(()=>auth.requireCsrf(request,origin,'other-binding',secret));
 assert.throws(()=>auth.requireCsrf(new Request(origin,{headers:{origin:'https://other.example.test'}}),origin,binding,secret));
 await assert.rejects(auth.resolvePrincipal({userId:id(4)},id(1),'invoices:read',{resolve:async()=>({companyId:id(2),billingAccountId:id(3),userId:id(4),active:true,capabilities:['invoices:read']})}),e=>e.status===403);
});
test('trusted context is transaction-local and lock order is deterministic, using injected transport only',async()=>{
 const {bindTransactionContext}=loadSource('lib/server/command-protocol');const calls=[];
 const tx={query:async(sql,values)=>{calls.push({sql,values});return {rows:sql.startsWith('SELECT pg_backend_pid')?[{pid:123,transaction_id:'456'}]:(values?.[1]??[]).map(id=>({id})),rowCount:0};}};
 await bindTransactionContext(tx,{sessionCookie:'synthetic-session',companyId:id(1),capability:'invoices:read'},{issue:async input=>{assert.equal(input.backendPid,123);assert.equal(input.transactionId,'456');return {ticket:'s'.repeat(43)};}});
 assert.equal(calls[1].sql,"SELECT set_config('app.context_ticket',$1,true)");
 
});
test('review candidate has one atomic boundary, capability RLS and no runnable runtime grants; not PostgreSQL validation',()=>{
 const sql=fs.readFileSync('database/drafts/milestone-4a/001_atomic_vat.review.sql','utf8');
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);assert.ok(sql.includes('FORCE ROW LEVEL SECURITY'));assert.ok(sql.includes('t.transaction_id=pg_current_xact_id()'));assert.ok(sql.includes('t.runtime_role=session_user'));assert.ok(!/^GRANT /m.test(sql));
 for(const [role,caps] of Object.entries(auth.roleCapabilities))for(const cap of caps)assert.ok(sql.includes(`('${role}','${cap}')`));
});
test('monitoring allowlist never serializes added tokens/error messages',()=>{
 const {operationTelemetry}=loadSource('lib/server/telemetry');
 const event=operationTelemetry({requestId:id(1),operation:'invoice.save',status:200,durationMs:1.5,token:'synthetic-not-real',message:'private synthetic fixture'});
 assert.deepEqual(Object.keys(event).sort(),['durationMs','operation','requestId','status']);assert.equal(JSON.stringify(event).includes('synthetic-not-real'),false);
});
test('spreadsheet worker preserves benign XLSX rows and rejects bad signatures, oversized cells and excess sheets',()=>{
 const XLSX=require('xlsx');const {stripTypeScriptTypes}=require('node:module');
 let result;const scope={onmessage:null,postMessage:value=>{result=value;}};
 const source=stripTypeScriptTypes(fs.readFileSync('lib/spreadsheet.worker.ts','utf8')).replace(/import\s+\*\s+as\s+XLSX\s+from\s+"xlsx";/,'');
 new Function('XLSX','globalThis',source)(XLSX,scope);
 const workbook=(rows,sheets=1)=>{const book=XLSX.utils.book_new();for(let i=0;i<sheets;i++)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Sheet'+i);return Uint8Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})).buffer;};
 scope.onmessage({data:workbook([['Date','Amount'],['2026-10-20',-100.25]])});assert.equal(result.ok,true);assert.equal(result.sheets.Sheet0[1][1],'-100.25');
 scope.onmessage({data:workbook([['x'.repeat(2001)]])});assert.equal(result.ok,false);
 scope.onmessage({data:workbook([['x']],21)});assert.equal(result.ok,false);
 scope.onmessage({data:Uint8Array.from([1,2,3,4]).buffer});assert.equal(result.ok,false);
});

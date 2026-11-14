const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const catalog=loadSource('lib/plan-catalog');
const cleanup=loadSource('lib/workspace-bootstrap');
test('catalogue specifies trial, paid limits, history, ORS and team without granting access',()=>{
 assert.deepEqual(catalog.trialTerms,{days:14,invoices:100,period:'trial',orsIncluded:true,cardRequired:false});
 assert.deepEqual(Object.values(catalog.subscriptionPlans).map(p=>[p.monthlyPrice,p.invoices,p.companies,p.membersIncludingOwner,p.historyDays]),[['9.00',30,2,2,90],['15.00',100,2,4,180],['25.00',300,3,6,null]]);
 assert.equal(catalog.planMonthlyPrice('Basic',true),'14.00');assert.equal(catalog.planMonthlyPrice('Starter',true),'15.00');assert.equal(catalog.subscriptionPlans.Starter.recommended,true);
 assert.ok(catalog.vatPlanFeatures.includes('Invoice uploads and OCR'));assert.ok(catalog.vatPlanFeatures.includes('Manual invoice creation'));assert.equal(catalog.subscriptionPlans.Starter.orsIncluded,true);assert.equal(catalog.subscriptionPlans.Growth.orsIncluded,true);
});
test('usage previews count unique creations across companies and use the comparison allowance',()=>{
 const {previewInvoiceUsage}=loadSource('tests/fixtures/subscription-preview');
 const rows=Array.from({length:70},(_,i)=>({id:'synthetic-'+i,companyId:i<35?'a':'b',createdAt:'2026-10-20T00:00:00Z'}));
 assert.equal(previewInvoiceUsage([...rows,rows[0]],'2026-10-01','2026-11-01','Starter').remaining,30);
 assert.equal(previewInvoiceUsage(rows,'2026-10-01','2026-11-01','Basic').over,40);
 assert.throws(()=>previewInvoiceUsage(rows,'2026-10-01','2026-11-01','Unknown'));
});
test('edited legacy records are preserved and explicitly discoverable for review',()=>{
 const demo=loadSource('tests/fixtures/legacy-workspace'),{restoreWorkspace}=loadSource('lib/workspace');
 const state=restoreWorkspace(JSON.stringify({invoices:demo.invoices,documents:demo.documents}),{...demo,selectedCompanyId:demo.companies[0].id,settings:{}});
 state.invoices[0]={...state.invoices[0],notes:'Synthetic user modification'};
 const raw=JSON.stringify(state),result=cleanup.loadLocalWorkspace({getItem:()=>raw});
 assert.equal(result.invoices[0].notes,'Synthetic user modification');
 assert.ok(cleanup.legacyRecordReview(result).some(r=>r.kind==='invoices'&&r.id===state.invoices[0].id));
 assert.equal(result.invoices.length,state.invoices.length);
 assert.deepEqual(cleanup.legacyRecordReview(cleanup.emptyWorkspace()),[]);
});
test('trial reservation contract uses 100 monthly creations and requires authoritative unexpired dates',async()=>{
 const {reserveInvoiceAllowance}=loadSource('lib/server/account-usage');
 const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let received;
 const resolver={resolve:async()=>({accountId:uuid(4),plan:'Trial',active:true,period:{start:'2026-10-01',end:'2026-11-01'}})};
 const ledger={reserve:async input=>{received=input;return {allowed:true,used:1,reserved:0,reservationId:'synthetic'};}};
 await reserveInvoiceAllowance({userId:uuid(1),companyId:uuid(2),invoiceId:uuid(3)},resolver,ledger,Date.parse('2026-10-20'));
 assert.equal(received.limit,100);
 await assert.rejects(()=>reserveInvoiceAllowance({userId:uuid(1),companyId:uuid(2),invoiceId:uuid(3)},resolver,ledger,Date.parse('2026-11-02')));
});
test('approved spreadsheet parser roundtrips hostile-looking cell text without prototype mutation',()=>{
 const XLSX=require('xlsx');assert.equal(XLSX.version,'0.20.3');
 const rows=[['__proto__','constructor','Reference','Amount'],['synthetic','prototype','=HYPERLINK("https://example.test")','-0.01']];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Statement');
 const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),parsed=XLSX.read(bytes,{type:'buffer'});
 assert.deepEqual(XLSX.utils.sheet_to_json(parsed.Sheets.Statement,{header:1,raw:false}),rows);
 assert.equal(Object.prototype.synthetic,undefined);
});

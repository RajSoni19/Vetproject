// Unit/golden/fault-injection and offline syntax tests, NOT live Stage B tests.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {loadSource}=require('./load-source.cjs');
const {calculateVat,vatPeriod}=loadSource('lib/server/saas/vat');
const {invoiceInput,contactInput,listInput,digest}=loadSource('lib/server/saas/invoice-contracts');
const {invoiceService,businessCommand}=loadSource('lib/server/saas/invoices');
const {reportFilters}=loadSource('lib/server/saas/reports');
const {invoiceFinancialService,paymentStatus,validatePaymentInput,validateTaxReviewInput}=loadSource('lib/server/saas/invoice-financials');
const {parseExtraction}=loadSource('lib/server/stage1/extraction');
const {processDocumentJob}=loadSource('lib/server/saas/document-worker');
const {parse:parseSql}=require('libpg-query');
const id=()=>crypto.randomUUID(),company=id(),actor=id(),session=id(),contact=id();
test('045 payments and VAT review migration is guarded and PostgreSQL-parseable without execution',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/045_invoice_payments_tax_reviews.review.sql','utf8');
 assert.match(sql,/current_database\(\).*vtv_uat_/);assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/recording_type='manual'/);assert.match(sql,/reject_immutable_change/);
 assert.ok((await parseSql(sql)).stmts.length>30);
});
test('046 not-evidenced VAT migration distinguishes missing evidence and remains review-only',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/046_invoice_vat_not_evidenced.review.sql','utf8');
 assert.match(sql,/current_database\(\).*vtv_uat_/);assert.match(sql,/treatment IN\('standard','reduced','zero','exempt','outside','not-evidenced'\)/);
 assert.match(sql,/reviewed_by IS NULL AND reviewed_at IS NULL/);assert.match(sql,/claim_status='review-required'/);
 assert.match(sql,/business\.scope\(company_id,'invoices:write'\)/);assert.ok((await parseSql(sql)).stmts.length>8);
 const rollback=fs.readFileSync('database/migrations/saas/046_invoice_vat_not_evidenced.rollback.review.sql','utf8');
 assert.match(rollback,/Rollback blocked/);assert.match(rollback,/treatment='not-evidenced'/);assert.ok((await parseSql(rollback)).stmts.length>8);
});
const policy={currency:'GBP',kind:'invoice',rounding:'line-half-up'};
const line=(patch={})=>({description:'Consulting',quantity:'1',unitPrice:'100',discount:'0',rate:'20',treatment:'standard',pricing:'exclusive',...patch});
const invoice=(patch={})=>({direction:'purchase',kind:'invoice',contactId:contact,number:'PUR-101',issuedOn:'2026-10-23',dueOn:null,currency:'GBP',rounding:'line-half-up',lines:[line()],notes:null,creditForId:null,...patch});
const scope={companyId:company,sessionCookie:'synthetic-unused',permission:'invoices:write'};
test('VAT golden: exclusive standard rate, fractional quantity and absolute discount',()=>{
 const r=calculateVat([line({quantity:'2.5',unitPrice:'12.34',discount:'0.85'})],policy);assert.deepEqual([r.net,r.vat,r.gross],['30.00','6.00','36.00']);
});
test('VAT golden: explicit reduced inclusive rate and discount on inclusive base',()=>{
 const r=calculateVat([line({unitPrice:'115',discount:'10',rate:'5',treatment:'reduced',pricing:'inclusive'})],policy);assert.deepEqual([r.net,r.vat,r.gross],['100.00','5.00','105.00']);
});
test('VAT golden: mixed standard, reduced, zero, exempt and outside treatments remain distinct',()=>{
 const r=calculateVat([line(),line({rate:'5',treatment:'reduced'}),...['zero','exempt','outside'].map(treatment=>line({rate:'0',treatment}))],policy);
 assert.deepEqual([r.net,r.vat,r.gross],['500.00','25.00','525.00']);assert.equal(new Set(r.lines.map(l=>l.treatment)).size,5);
});
test('VAT not evidenced keeps its own treatment and cannot carry an inferred rate',()=>{
 const r=calculateVat([line({unitPrice:'212.50',rate:'0',treatment:'not-evidenced'})],policy);
 assert.deepEqual([r.lines[0].treatment,r.net,r.vat,r.gross],['not-evidenced','212.50','0.00','212.50']);
 assert.throws(()=>calculateVat([line({rate:'20',treatment:'not-evidenced'})],policy),{status:400});
});
test('VAT golden: credit note reverses facts without negative input quantities',()=>{
 const r=calculateVat([line()],{...policy,kind:'credit-note'});assert.deepEqual([r.net,r.vat,r.gross],['-100.00','-20.00','-120.00']);
});
test('VAT golden: line versus tax-group rounding allocates a penny deterministically',()=>{
 const lines=[line({unitPrice:'0.03'}),line({unitPrice:'0.03'})];
 assert.equal(calculateVat(lines,policy).vat,'0.02');const grouped=calculateVat(lines,{...policy,rounding:'tax-group-half-up'});assert.equal(grouped.vat,'0.01');assert.deepEqual(grouped.lines.map(l=>l.vat),['0.01','0.00']);assert.equal(grouped.gross,'0.07');
});
test('VAT golden: inclusive grouping preserves gross and reconciles net plus tax',()=>{
 const r=calculateVat([line({unitPrice:'0.03',pricing:'inclusive'}),line({unitPrice:'0.03',pricing:'inclusive'})],{...policy,rounding:'tax-group-half-up'});
 assert.deepEqual([r.net,r.vat,r.gross],['0.05','0.01','0.06']);
});
test('VAT refuses unknown/missing rates, classifications, defaults, floats and overflow',()=>{
 for(const patch of [{rate:undefined},{rate:'20',treatment:'exempt'},{rate:'0',treatment:'standard'},{quantity:'-1'},{quantity:1},{unitPrice:'1e3'},{discount:'101'},{rate:'100.0001'},{unitPrice:'1.00001'},{pricing:undefined},{description:''},{quantity:'999999999999',unitPrice:'999999999999'}])assert.throws(()=>calculateVat([line(patch)],policy),{status:400});
 for(const patch of [{rounding:undefined},{currency:'JPY'},{kind:'unknown'}])assert.throws(()=>calculateVat([line()],{...policy,...patch}),{status:400});
 assert.throws(()=>calculateVat([],policy),{status:400});assert.throws(()=>calculateVat(Array(501).fill(line()),policy),{status:400});
});
test('configured VAT period validates actual dates, bound, order and currency',()=>{
 assert.equal(vatPeriod({startsOn:'2028-02-29',endsOn:'2028-03-31',currency:'GBP'}).startsOn,'2028-02-29');
 for(const v of [{startsOn:'2026-02-29',endsOn:'2026-03-31',currency:'GBP'},{startsOn:'2026-11-01',endsOn:'2026-10-01',currency:'GBP'},{startsOn:'2026-01-01',endsOn:'2027-12-31',currency:'GBP'},{startsOn:'2026-01-01',endsOn:'2026-03-31',currency:'XXX'}])assert.throws(()=>vatPeriod(v),{status:400});
});
test('invoice contracts normalize identity and preserve multiple identical lines; credit origin mandatory',()=>{
 const r=invoiceInput(invoice({number:'  pur / 101  ',lines:[line(),line()]}));assert.equal(r.numberKey,'PUR101');assert.equal(r.calculation.lines.length,2);
 const unevidenced=invoiceInput(invoice({lines:[line({unitPrice:'212.50',rate:'0',treatment:'not-evidenced'})]}));assert.deepEqual([unevidenced.calculation.net,unevidenced.calculation.vat,unevidenced.calculation.gross],['212.50','0.00','212.50']);
 assert.throws(()=>invoiceInput(invoice({number:'////'})),{status:400});assert.throws(()=>invoiceInput(invoice({kind:'credit-note'})),{status:400});assert.throws(()=>invoiceInput(invoice({creditForId:id()})),{status:400});assert.throws(()=>invoiceInput(invoice({createdBy:actor})),{status:400});
});
test('contacts validate email, normalize bounded fields and reject supplied ownership',()=>{
 const v={kind:'supplier',name:'  Example Ltd ',email:'Accounts@Example.test',status:'active'};assert.equal(contactInput(v).email,'accounts@example.test');assert.equal(contactInput(v).name,'Example Ltd');
 for(const patch of [{email:'bad'},{companyId:company},{name:'x'.repeat(201)},{status:'paid'},{name:'\ufb03'.repeat(100)}])assert.throws(()=>contactInput({...v,...patch}),{status:400});
});
test('pagination and filters refuse SQL selectors, repeated and unsupported filters',()=>{
 assert.equal(listInput(new URLSearchParams({limit:'100',query:"'; DROP TABLE invoices; --"})).limit,100);
 for(const s of ['limit=101','limit=1&limit=2','sort=DROP','status=paid','after=1','kind=supplier'])assert.throws(()=>listInput(new URLSearchParams(s)),{status:400});
 assert.equal(listInput(new URLSearchParams('kind=supplier'),'contacts').kind,'supplier');
});
function fakeDatabase(query){let calls=[];return {calls,scoped:async(s,fn)=>fn({companyId:s.companyId,actorId:actor,sessionId:session,permission:s.permission,query:async(sql,values)=>{calls.push({sql,values});return query(sql,values);}})};}
const {documentWorkflow}=loadSource('lib/server/saas/documents');
test('document listing uses tenant-scoped composite cursors and rejects malformed pagination',async()=>{
 const ids=[id(),id(),id()],stamp='2026-10-30 10:00:00+00',db=fakeDatabase(async(sql,values)=>({rows:values[1]===null&&values[3]===3?ids.map((docId,index)=>({id:docId,created_at:`2026-10-${30-index} 10:00:00+00`,original_name:`invoice-${index}.pdf`})):[]})),workflow=documentWorkflow(db,undefined),first=await workflow.list({...scope,permission:'documents:read'},new URLSearchParams({limit:'2'}));
 assert.equal(first.items.length,2);assert.ok(first.nextCursor);assert.match(db.calls[0].sql,/d\.company_id=\$1/);assert.match(db.calls[0].sql,/\(d\.created_at,d\.id\)<\(\$2::timestamptz,\$3::uuid\)/);assert.equal(db.calls[0].values[0],company);assert.equal(db.calls[0].values[3],3);
 const cursor=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString()),second=await workflow.list({...scope,permission:'documents:read'},new URLSearchParams({limit:'2',cursor:first.nextCursor}));assert.deepEqual(db.calls[1].values,[company,cursor.at,cursor.id,3]);assert.equal(second.items.length,0);
 const count=db.calls.length;for(const query of ['limit=2&limit=3','sort=created_at','cursor=not-a-valid-cursor'])await assert.rejects(workflow.list({...scope,permission:'documents:read'},new URLSearchParams(query)),{status:400});assert.equal(db.calls.length,count);
});test('wrong command permission rejects before acquiring a connection',async()=>{
 let calls=0;const service=invoiceService({scoped:async()=>{calls++;}});await assert.rejects(async()=>service.create({...scope,permission:'reports:read'},invoice(),'key'.repeat(8)),{status:403});assert.equal(calls,0);
});
test('invoice list binds company, pagination and hostile search as parameters',async()=>{
 const db=fakeDatabase(async()=>({rows:[]}));const payload="'; DROP TABLE invoices; --";await invoiceService(db).list({...scope,permission:'invoices:read'},new URLSearchParams({query:payload}));assert.equal(db.calls.length,1);assert.ok(!db.calls[0].sql.includes(payload));assert.equal(db.calls[0].values[0],company);assert.ok(db.calls[0].values.includes(payload));
});
test('contact edits require contact permission, current version, tenant scope and append an audit event',async()=>{
 const existing={id:id(),version:7},input={kind:'supplier',name:'Updated Supplier',email:'billing@example.test',phone:null,vatNumber:'GB123',address:'1 Example Road',status:'active'},payload={id:existing.id,version:existing.version,input},expected=digest(payload),db=fakeDatabase(async sql=>{
  if(sql.startsWith('SELECT payload_hash'))return {rows:[{payload_hash:expected,response:null}]};
  if(sql.startsWith('UPDATE business.counterparties'))return {rows:[{id:existing.id,version:8}]};
  return {rows:[]};
 });
 const result=await invoiceService(db).saveContact({...scope,permission:'contacts:write'},input,'contact-edit-12345678',existing);assert.equal(result.version,8);const update=db.calls.find(call=>call.sql.startsWith('UPDATE business.counterparties'));assert.deepEqual(update.values.slice(0,3),[company,existing.id,existing.version]);assert.ok(db.calls.some(call=>call.sql.includes('INSERT INTO saas.audit_events')&&call.values.includes('contact.saved')));
 await assert.rejects(async()=>invoiceService(db).saveContact({...scope,permission:'invoices:write'},input,'contact-edit-22345678',existing),{status:403});
});
test('contact browsing binds type, search and cursor and returns a bounded continuation cursor',async()=>{
 const ids=[id(),id(),id()],db=fakeDatabase(async()=>({rows:ids.map((value,index)=>({id:value,index}))})),result=await invoiceService(db).contacts({...scope,permission:'contacts:read'},new URLSearchParams({kind:'supplier',query:'example',after:ids[0],limit:'2'}));assert.equal(db.calls.length,1);assert.deepEqual(db.calls[0].values,[company,ids[0],'supplier','example',3]);assert.equal(result.items.length,2);assert.equal(result.after,ids[1]);
});
test('OCR suggestions stay hidden until the current original version has a trusted clean inspection',async()=>{
 const documentId=id(),version='sha256-version',sha='a'.repeat(64),quarantined=fakeDatabase(async sql=>sql.startsWith('SELECT d.state')?{rows:[{state:'quarantined',object_version:version,sha256:sha,clean_inspection:false}]}:{rows:[]}),pending=await invoiceService(quarantined).extraction({...scope,permission:'documents:read'},documentId);
 assert.equal(pending.state,'pending-inspection');assert.deepEqual(pending.pages,[]);assert.equal(quarantined.calls.length,1);
 const jobId=id(),clean=fakeDatabase(async sql=>sql.startsWith('SELECT d.state')?{rows:[{state:'clean',object_version:version,sha256:sha,clean_inspection:true}]}:sql.includes('FROM business.extraction_jobs')?{rows:[{id:jobId,state:'completed',attempts:1,error_code:null}]}:sql.includes('FROM business.extraction_results')?{rows:[{page:1,observations:{invoiceNumber:'SYN-1'},engine:'isolated-test'}]}:{rows:[]}),result=await invoiceService(clean).extraction({...scope,permission:'documents:read'},documentId);
 assert.equal(result.pages.length,1);const jobQuery=clean.calls.find(call=>call.sql.includes('FROM business.extraction_jobs'));assert.deepEqual(jobQuery.values,[company,documentId,version,sha]);assert.match(jobQuery.sql,/j\.object_version=\$3 AND j\.sha256=\$4/);
});
test('draft deletion is schema gated, versioned, audited and never physically deletes invoice data',async()=>{
 const {invoiceSoftDeleteSchemaSha256}=loadSource('lib/server/saas/invoice-soft-delete'),savedEnabled=process.env.SAAS_INVOICE_SOFT_DELETE_ENABLED,savedHash=process.env.SAAS_INVOICE_SOFT_DELETE_SCHEMA_SHA256;
 const restore=()=>{if(savedEnabled===undefined)delete process.env.SAAS_INVOICE_SOFT_DELETE_ENABLED;else process.env.SAAS_INVOICE_SOFT_DELETE_ENABLED=savedEnabled;if(savedHash===undefined)delete process.env.SAAS_INVOICE_SOFT_DELETE_SCHEMA_SHA256;else process.env.SAAS_INVOICE_SOFT_DELETE_SCHEMA_SHA256=savedHash;};
 try{
  delete process.env.SAAS_INVOICE_SOFT_DELETE_ENABLED;const disabledDb=fakeDatabase(async()=>({rows:[]}));await assert.rejects(async()=>invoiceService(disabledDb).deleteDraft(scope,id(),'delete-key-12345678',1),{status:503});assert.equal(disabledDb.calls.length,0);
  process.env.SAAS_INVOICE_SOFT_DELETE_ENABLED='1';process.env.SAAS_INVOICE_SOFT_DELETE_SCHEMA_SHA256=invoiceSoftDeleteSchemaSha256;
  const invoiceId=id(),expected=digest({id:invoiceId,version:4}),db=fakeDatabase(async(sql)=>{
   if(sql.startsWith('SELECT payload_hash'))return {rows:[{payload_hash:expected,response:null}]};
   if(sql.startsWith('SELECT * FROM business.invoices'))return {rows:[{id:invoiceId,state:'draft',version:4,deleted_at:null}]};
   if(sql.startsWith('UPDATE business.invoices SET deleted_at'))return {rows:[{id:invoiceId,version:5,state:'draft',deleted_at:'2026-10-29T00:00:00Z'}]};
   return {rows:[]};
  });const result=await invoiceService(db).deleteDraft(scope,invoiceId,'delete-key-12345678',4);
  assert.equal(result.version,5);assert.ok(db.calls.some(c=>c.sql.startsWith('UPDATE business.invoices SET deleted_at=')));assert.ok(db.calls.some(c=>c.sql.includes('INSERT INTO saas.audit_events')&&c.values.includes('invoice.deleted')));assert.ok(!db.calls.some(c=>/^DELETE\s+FROM\s+business\.invoices/i.test(c.sql)));
 }finally{restore();}
});
test('idempotent command replay returns stored outcome and does not repeat writes',async()=>{
 const payload={number:'X'},digest=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');let performed=0;const calls=[];
 const tx={companyId:company,actorId:actor,permission:'invoices:write',query:async(sql,v)=>{calls.push({sql,v});return {rows:sql.startsWith('SELECT payload_hash')?[{payload_hash:digest,response:{id:'retained'}}]:[]};}};
 assert.deepEqual(await businessCommand(tx,'invoice.create','stable-key-12345678',payload,async()=>{performed++;}),{id:'retained'});assert.equal(performed,0);assert.ok(!JSON.stringify(calls).includes('stable-key-12345678'));
 await assert.rejects(businessCommand(tx,'invoice.create','stable-key-12345678',{number:'different'},async()=>{}),{status:409});
});
test('draft creation computes totals on server, stores ordered lines and audit in same callback',async()=>{
 const db=fakeDatabase(async(sql,v)=>({rows:sql.startsWith('SELECT payload_hash')?[{payload_hash:require('../tests/load-source.cjs').loadSource('lib/server/saas/invoice-contracts').digest(invoiceInput(invoice())),response:null}]:sql.startsWith('INSERT INTO business.invoices')?[{id:v[0],version:1,state:'draft'}]:[]}));
 const r=await invoiceService(db).create(scope,invoice(),'stable-create-12345678');assert.equal(r.state,'draft');const insert=db.calls.find(c=>c.sql.startsWith('INSERT INTO business.invoices'));assert.deepEqual(insert.values.slice(14,17),['100.00','20.00','120.00']);assert.equal(db.calls.filter(c=>c.sql.startsWith('INSERT INTO business.invoice_lines')).length,1);assert.ok(db.calls.some(c=>c.sql.includes('INSERT INTO saas.audit_events')));
});
test('stale version cannot reach invoice update or append audit',async()=>{
 const db=fakeDatabase(async(sql)=>({rows:sql.startsWith('SELECT payload_hash')?[{payload_hash:loadSource('lib/server/saas/invoice-contracts').digest({id:contact,version:1}),response:null}]:sql.startsWith('SELECT * FROM business.invoices')?[{state:'draft',version:2}]:[]}));
 await assert.rejects(invoiceService(db).confirm({...scope,permission:'invoices:confirm'},contact,'stable-confirm-12345678',1),{status:409});assert.ok(!db.calls.some(c=>c.sql.startsWith('UPDATE business.invoices')));
});
test('VAT claim-ready query is gated and separates sales from verified purchase evidence',async()=>{
 const db=fakeDatabase(async(sql)=>sql.startsWith('SELECT to_regclass')?{rows:[{ready:true}]}:{rows:[]});await invoiceService(db).vatReport({...scope,permission:'reports:read'},{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});
 assert.equal(db.calls.length,3);assert.match(db.calls[1].sql,/i\.state='confirmed'/);assert.match(db.calls[1].sql,/i\.direction='sale'/);assert.match(db.calls[2].sql,/t\.claim_status='eligible'/);assert.match(db.calls[2].sql,/t\.evidence_verified/);assert.match(db.calls[2].sql,/accounting_scheme='cash'/);assert.deepEqual(db.calls[1].values,[company,'2026-10-01','2026-10-31','GBP']);
 await parseSql(db.calls[1].sql);await parseSql(db.calls[2].sql);
});
test('input/output VAT reporting nets credits using exact signed decimal strings',async()=>{
 const db=fakeDatabase(async(sql)=>sql.startsWith('SELECT to_regclass')?{rows:[{ready:true}]}:sql.includes('JOIN business.invoice_lines')?{rows:[{direction:'sale',vat:'40.00'}]}:{rows:[{direction:'purchase',vat:'15.00'}]});const r=await invoiceService(db).vatReport({...scope,permission:'reports:read'},{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});assert.deepEqual([r.inputVat,r.outputVat,r.netVat],['15.00','40.00','25.00']);assert.equal(r.hmrcSubmission,false);
});
test('payment statuses derive exactly and payment/VAT review inputs cannot fabricate evidence',()=>{
 assert.deepEqual(['0.00','1.00','119.99','120.00'].map(paid=>paymentStatus('120.00',paid)),['unpaid-due','partially-paid','partially-paid','fully-paid']);
 assert.equal(paymentStatus('0.00','0.00'),'not-applicable');assert.throws(()=>paymentStatus('120.00','120.01'),{status:503});
 const payment={amount:'25.00',method:'bank-transfer',paidOn:'2026-10-26',transactionReference:'TX-1',notes:'',evidenceVerified:false};
 assert.equal(validatePaymentInput(payment).amount,'25.00');assert.throws(()=>validatePaymentInput({...payment,evidenceVerified:true,transactionReference:''}),{status:400});assert.throws(()=>validatePaymentInput({...payment,amount:'1e2'}),{status:400});
 for(const method of ['card','bank-transfer','cash','other'])assert.equal(validatePaymentInput({...payment,method}).method,method);
 const review={evidencedVat:'20.00',evidenceReference:'Original page 1: VAT line',evidenceVerified:true,claimStatus:'eligible',taxTreatment:'standard',accountingScheme:'invoice'};
 assert.equal(validateTaxReviewInput(review).claimStatus,'eligible');assert.throws(()=>validateTaxReviewInput({...review,evidencedVat:null}),{status:400});assert.throws(()=>validateTaxReviewInput({...review,taxTreatment:'exempt'}),{status:400});
 assert.equal(validateTaxReviewInput({...review,evidenceVerified:false,claimStatus:'review-required'}).claimStatus,'review-required');
});
test('financial mutations refuse caller-supplied permission substitution before connecting',async()=>{
 let calls=0;const service=invoiceFinancialService({scoped:async()=>{calls++;return null;}}),valid={amount:'1.00',method:'cash',paidOn:'2026-10-26',evidenceVerified:false};
 await assert.rejects(service.recordPayment({...scope,permission:'reports:read'},id(),valid,'permission-test-1234'),{status:403});
 await assert.rejects(service.saveTaxReview({...scope,permission:'reports:read'},id(),{evidencedVat:null,evidenceVerified:false,claimStatus:'review-required',taxTreatment:'unknown',accountingScheme:'invoice'},'permission-test-5678'),{status:403});
 assert.equal(calls,0);
});
test('payment ledger supports multiple company-scoped entries, updates and exact remaining balances',async()=>{
 const invoiceId=id(),commands=new Map(),payments=[],calls=[];
 const db={scoped:async(s,work)=>work({companyId:s.companyId,actorId:actor,permission:s.permission,query:async(sql,v=[])=>{
  calls.push({sql,values:v});
  if(sql.startsWith('SELECT to_regclass'))return {rows:[{ready:true}]};
  if(sql.startsWith('INSERT INTO business.command_keys')){commands.set(v[4],{payload_hash:v[5],response:null});return {rows:[]};}
  if(sql.startsWith('SELECT payload_hash,response'))return {rows:[commands.get(v[3])].filter(Boolean)};
  if(sql.startsWith('UPDATE business.command_keys SET response')){const row=commands.get(v[3]);if(row)row.response=JSON.parse(v[4]);return {rows:[]};}
  if(sql.startsWith('SELECT id::text,state,kind,direction,currency,gross::text'))return {rows:[{id:invoiceId,state:'confirmed',kind:'invoice',direction:'purchase',currency:'GBP',gross:'120.00',vat:'20.00',due_on:'2026-10-26'}]};
  if(sql.startsWith('SELECT id::text,amount::text,method,paid_on::text'))return {rows:payments.filter(p=>p.company_id===v[0]&&p.invoice_id===v[1]).map(({company_id,invoice_id,...row})=>row)};
  if(sql.startsWith('INSERT INTO business.invoice_payments')){const row={id:id(),amount:v[2],method:v[3],paid_on:v[4],transaction_reference:v[5],notes:v[6],evidence_verified:v[7],recording_type:'manual',version:1,created_at:'2026-10-26',updated_at:'2026-10-26',company_id:v[0],invoice_id:v[1]};payments.push(row);return {rows:[(({company_id,invoice_id,...entry})=>entry)(row)]};}
  if(sql.startsWith('SELECT amount::text,version FROM business.invoice_payments')){const row=payments.find(p=>p.company_id===v[0]&&p.invoice_id===v[1]&&p.id===v[2]);return {rows:row?[{amount:row.amount,version:row.version}]:[]};}
  if(sql.startsWith('UPDATE business.invoice_payments')){const row=payments.find(p=>p.company_id===v[0]&&p.invoice_id===v[1]&&p.id===v[2]);if(!row)return {rowCount:0,rows:[]};Object.assign(row,{amount:v[3],method:v[4],paid_on:v[5],transaction_reference:v[6],notes:v[7],evidence_verified:v[8],version:row.version+1});return {rowCount:1,rows:[{id:row.id}]};}
  return {rows:[],rowCount:1};
 }})};
 const service=invoiceFinancialService(db),access={...scope,permission:'invoices:write'};
 const first=await service.recordPayment(access,invoiceId,{amount:'60.00',method:'bank-transfer',paidOn:'2026-10-26',transactionReference:'A',evidenceVerified:false},'payment-first-123456');
 assert.deepEqual([first.status,first.paid,first.balance,first.entries.length],['partially-paid','60.00','60.00',1]);
 const second=await service.recordPayment(access,invoiceId,{amount:'60.00',method:'cash',paidOn:'2026-10-27',transactionReference:'B',evidenceVerified:false},'payment-second-1234');
 assert.deepEqual([second.status,second.paid,second.balance,second.entries.length],['fully-paid','120.00','0.00',2]);
 const updated=await service.updatePayment(access,invoiceId,first.entries[0].id,{amount:'25.00',method:'bank-transfer',paidOn:'2026-10-26',transactionReference:'A',evidenceVerified:false},'payment-update-123456',1);
 assert.deepEqual([updated.status,updated.paid,updated.balance,updated.entries.length],['partially-paid','85.00','35.00',2]);
 assert.ok(calls.filter(call=>call.sql.startsWith('INSERT INTO business.invoice_payments')).every(call=>call.values[0]===company));
 assert.ok(calls.some(call=>call.sql.includes('INSERT INTO saas.audit_events')&&call.values.includes('invoice.payment.recorded')));
 assert.ok(calls.some(call=>call.sql.includes('INSERT INTO saas.audit_events')&&call.values.includes('invoice.payment.updated')));
 assert.ok(calls.some(call=>call.sql.includes("pg_advisory_xact_lock(hashtextextended('invoice-financial:'")),'Financial mutations serialize without taking a row lock blocked by confirmed-invoice RLS.');
 assert.ok(calls.filter(call=>call.sql.startsWith('SELECT id::text,state,kind,direction,currency,gross::text')).every(call=>!call.sql.includes('FOR UPDATE')));
});
test('invoice report filters validate date, supplier, payment and VAT selections',()=>{
 const base={startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'};
 assert.equal(reportFilters(new URLSearchParams({...base,paymentStatus:'partially-paid',vatStatus:'eligible'})).vatStatus,'eligible');
 for(const patch of [{paymentStatus:'gateway-paid'},{vatStatus:'inferred'},{contactId:'not-a-uuid'},{startsOn:'2026-11-01'}])assert.throws(()=>reportFilters(new URLSearchParams({...base,...patch})),{status:400});
});
test('invoice report SQL parses for standard reads and schema-backed Excel exports',async()=>{
 const {reportService}=loadSource('lib/server/saas/reports');
 for(const format of [null,'xlsx']){
  const db=fakeDatabase(async(sql)=>sql.startsWith('SELECT to_regclass')?{rows:[{ready:true}]}:{rows:[{count:'0',net:'0.00',vat:'0.00',gross:'0.00',items:[]}]});
  const query=new URLSearchParams({startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'});if(format)query.set('format',format);
  await reportService(db).invoices({...scope,permission:format?'reports:export':'reports:read'},query);
  const sql=db.calls.find(call=>call.sql.startsWith('WITH base AS MATERIALIZED')).sql;await parseSql(sql);
  assert.equal(sql.includes('business.invoice_payments'),Boolean(format));
 }
});
test('invoice report export contains verified summary and every item on exactly two safe Excel sheets',()=>{
 const {exportReport}=loadSource('lib/server/saas/exports'),XLSX=require('xlsx'),invoiceId=id(),fixture=[
  ['Red onion 10kg','1.00','12.00','12.00'],['Onions -20kg','1.00','15.00','15.00'],['Button mushroom','1.00','9.00','9.00'],
  ['Piper','1.00','18.00','18.00'],['Peeld garlic Box','1.00','45.00','45.00'],['Bird eye chilli','1.00','15.00','15.00'],
  ['Spinich (PALAK)','2.00','14.50','29.00'],['Aubergine 400','2.00','11.50','23.00'],['Cabbage','1.00','16.00','16.00'],
  ['Coriandar','1.00','10.50','10.50'],['Vine tomato','1.00','12.00','12.00'],['Mint Bunches','1.00','8.00','8.00']
 ],report={filters:{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP',status:'confirmed',contactId:null,paymentStatus:null,vatStatus:null},items:[{id:invoiceId,number:'=HYPERLINK("https://invalid.test")',issued_on:'2026-10-26',due_on:'2026-10-26',direction:'purchase',kind:'invoice',state:'confirmed',contact:'@SUM(1,1)',currency:'GBP',net:'212.50',vat:'0.00',gross:'212.50',vat_evidenced:null,vat_claim_status:'not-evidenced',payment_status:'fully-paid',payment_method:'bank-transfer',amount_paid:'212.50',balance_due:'0.00',original_document_reference:"=cmd|'/C calc!A0"}],lineItems:fixture.map(([description,quantity,unit_price,net],i)=>({invoice_id:invoiceId,invoice_number:'INV-000110',supplier:'RK Fruits & Vegetables Limited',invoice_date:'2026-10-26',position:i+1,description:i===0?'=1+1':description,quantity,unit_price,discount:'0.00',treatment:'not-evidenced',rate:'0.00',pricing:'exclusive',net,vat:'0.00',gross:net})),count:'1',net:'212.50',vat:'0.00',gross:'212.50',after:null};
 assert.equal(report.lineItems.reduce((sum,row)=>sum+BigInt(row.net.replace('.','')),BigInt(0)),BigInt(21250));
 const output=exportReport(report,company,'xlsx'),book=XLSX.read(output.bytes);
 assert.deepEqual(book.SheetNames,['Invoice Summary','Invoice Line Items']);
 const summary=book.Sheets['Invoice Summary'],lines=book.Sheets['Invoice Line Items'];
 assert.equal(XLSX.utils.sheet_to_json(summary).length,1);assert.equal(XLSX.utils.sheet_to_json(lines).length,12);
 assert.equal(summary.A2.f,undefined);assert.equal(summary.A2.v,"'=HYPERLINK(\"https://invalid.test\")");assert.equal(summary.B2.v,"'@SUM(1,1)");
 assert.equal(summary.P2.v,"'=cmd|'/C calc!A0");assert.equal(lines.E2.f,undefined);assert.equal(lines.E2.v,"'=1+1");assert.equal(lines.J2.v,'');assert.equal(lines.M2.v,'');
 assert.deepEqual(['A1','B1','C1','D1','E1','F1','G1','H1','I1','J1','K1','L1','M1','N1','O1','P1'].map(cell=>summary[cell].v),['Invoice number','Supplier','Invoice date','Due date','Currency','Direction','Invoice status','Subtotal','VAT evidenced','VAT claim eligibility','Grand total','Payment status','Payment method','Amount paid','Balance due','Original invoice reference']);
});
test('Excel report loads persisted company-scoped lines without payment schema and labels unavailable financial fields honestly',async()=>{
 const {reportService}=loadSource('lib/server/saas/reports'),invoiceId=id(),calls=[],lines=Array.from({length:12},(_,index)=>({invoice_id:invoiceId,invoice_number:'INV-000110',supplier:'RK Fruits & Vegetables Limited',invoice_date:'2026-10-26',position:index+1,description:'Line '+(index+1),quantity:'1.00',unit_price:'17.7083333333',discount:'0.00',treatment:'not-evidenced',rate:'0.00',pricing:'exclusive',net:'17.7083333333',vat:'0.00',gross:'17.7083333333'}));
 const reportRow={id:invoiceId,number:'INV-000110',issued_on:'2026-10-26',due_on:'2026-10-26',direction:'purchase',kind:'invoice',state:'confirmed',contact:'RK Fruits & Vegetables Limited',currency:'GBP',net:'212.50',vat:'0.00',gross:'212.50',vat_evidenced:null,vat_claim_status:'review-required',payment_status:'unavailable',payment_method:null,amount_paid:null,balance_due:null,original_document_reference:'doc-id · INV-000110.pdf'};
 const db=fakeDatabase(async(sql,values)=>{calls.push({sql,values});if(sql.startsWith('SELECT to_regclass'))return {rows:[{ready:false}]};if(sql.startsWith('WITH base AS MATERIALIZED'))return {rows:[{count:'1',net:'212.50',vat:'0.00',gross:'212.50',items:[reportRow]}]};if(sql.startsWith('SELECT i.id::text AS invoice_id'))return {rows:lines};return {rows:[]};});
 const result=await reportService(db).invoices({...scope,permission:'reports:export'},new URLSearchParams('startsOn=2026-10-01&endsOn=2026-10-31&currency=GBP&format=xlsx'));
 const base=calls.find(call=>call.sql.startsWith('WITH base AS MATERIALIZED')),lineQuery=calls.find(call=>call.sql.startsWith('SELECT i.id::text AS invoice_id'));
 assert.equal(result.items.length,1);assert.equal(result.lineItems.length,12);assert.equal(result.items[0].payment_status,'unavailable');
 assert.match(base.sql,/'unavailable'::text AS payment_status/);assert.doesNotMatch(base.sql,/business\.invoice_payments/);
 assert.match(lineQuery.sql,/i\.company_id=\$1/);assert.match(lineQuery.sql,/i\.state='confirmed'/);assert.deepEqual(lineQuery.values,[company,[invoiceId]]);
 await parseSql(base.sql);await parseSql(lineQuery.sql);
 const {exportReport}=loadSource('lib/server/saas/exports'),XLSX=require('xlsx'),book=XLSX.read(exportReport(result,company,'xlsx').bytes);
 assert.equal(book.Sheets['Invoice Summary'].L2.v,'Unavailable — schema approval pending');
 assert.equal(book.Sheets['Invoice Summary'].N2.v,'');assert.equal(book.Sheets['Invoice Summary'].N2.f,undefined);assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Invoice Line Items']).length,12);
});
test('INV-000110 extraction regression preserves explicitly present invoice facts and does not infer VAT',()=>{
 const source=`Name: RK Fruits & Vegetables Limited
Invoice# INV-000110
Invoice Date: 26/10/2026
Due Date: 26/10/2026
Currency: GBP
Sub Total £212.50
Total £212.50
1 Red onion 10kg 1 12.00 12.00
2 Onions -20kg 1 15.00 15.00
3 Button mushroom 1 9.00 9.00
4 Piper 1 18.00 18.00
5 Peeld garlic Box 1 45.00 45.00
6 Bird eye chilli 1 15.00 15.00
7 Spinich (PALAK) 2 14.50 29.00
8 Aubergine 400 2 11.50 23.00
9 Cabbage 1 16.00 16.00
10 Coriandar 1 10.50 10.50
11 Vine tomato 1 12.00 12.00
12 Mint Bunches 1 8.00 8.00`;
 const result=parseExtraction(source);
 assert.deepEqual([result.supplierName,result.invoiceNumber,result.invoiceDate,result.dueDate,result.currency,result.net,result.vat,result.gross,result.lines.length,result.vatEvidence],['RK Fruits & Vegetables Limited','INV-000110','2026-10-26','2026-10-26','GBP','212.50',null,'212.50',12,'not-evidenced']);
 assert.ok(result.warnings.includes('VAT not evidenced — review required'));assert.equal(result.lines.reduce((sum,row)=>sum+BigInt(row.net.replace('.','')),BigInt(0)),BigInt(21250));
});
function workerFixture(){const document=id(),bytes=Buffer.from([137,80,78,71,13,10,26,10,1]),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),lease={jobId:id(),leaseId:id(),companyId:company,documentId:document,mime:'image/png',original:{key:`companies/${company}/documents/${document}/${sha256}`,version:'v1',sha256,byteSize:bytes.length}},receipts=[];
 const store={claim:async()=>lease,finishInspection:async(l,r)=>{receipts.push(r);return true;},finishExtraction:async(l,p,e,f)=>{receipts.push({pages:p,engine:e,failure:f});return true;}};return {lease,store,receipts,originals:{read:async()=>bytes}};}
test('unconfigured trusted inspector does not claim or mark an original clean',async()=>{
 let claims=0;await assert.rejects(processDocumentJob('inspect',{claim:async()=>{claims++;}},null,{},new AbortController().signal),{status:503});assert.equal(claims,0);
});
test('scanner failure yields only error receipt; infected result stays rejected',async()=>{
 for(const verdict of ['failure','infected']){const f=workerFixture();await processDocumentJob('inspect',f.store,f.originals,{inspection:{inspect:async()=>{if(verdict==='failure')throw Error('secret scanner error');return {verdict,engine:'isolated-test-scanner',policy:'test'};}}},new AbortController().signal);assert.equal(f.receipts[0].verdict,verdict==='failure'?'error':'infected');}
});
test('corrupt worker original never reaches scanner or OCR',async()=>{
 const f=workerFixture();let scans=0;f.originals.read=async()=>Buffer.from('corrupt');await processDocumentJob('inspect',f.store,f.originals,{inspection:{inspect:async()=>{scans++;return {verdict:'clean',engine:'injected',policy:'test'};}}},new AbortController().signal);assert.equal(scans,0);assert.equal(f.receipts[0].verdict,'error');
});
test('invalid document signature ends extraction as INVALID_DOCUMENT without publishing OCR pages',async()=>{
 const f=workerFixture();f.lease.mime='application/pdf';let calls=0;await processDocumentJob('extract',f.store,f.originals,{ocr:{engine:'injected-test',pages:async()=>{calls++;return [{text:'untrusted',confidence:null}];}}},new AbortController().signal);assert.equal(calls,0);assert.equal(f.receipts[0].pages,null);assert.equal(f.receipts[0].failure,'INVALID_DOCUMENT');
});
test('worker deadline returns without accepting a hanging provider result',async()=>{
 const {boundedWorkerOperation}=loadSource('lib/server/saas/document-worker'),controller=new AbortController();const pending=boundedWorkerOperation(()=>new Promise(()=>{}),controller.signal);controller.abort();await assert.rejects(pending,/deadline/);
});
test('OCR preserves page provenance/confidence and mandatory manual review',async()=>{
 const f=workerFixture();await processDocumentJob('extract',f.store,f.originals,{ocr:{engine:'injected-test',pages:async()=>[{text:'Supplier: Example\nInvoice number: X\nCurrency: GBP',confidence:70}]}},new AbortController().signal);const r=f.receipts[0];assert.equal(r.failure,null);assert.equal(r.pages[0].confidence,70);assert.equal(r.pages[0].reviewRequired,true);assert.equal(r.pages[0].source.sha256,f.lease.original.sha256);assert.equal(r.pages[0].extraction.reviewRequired,true);
});
test('stale worker completion is rejected; invalid OCR output never publishes pages',async()=>{
 const f=workerFixture();f.store.finishInspection=async()=>false;await assert.rejects(processDocumentJob('inspect',f.store,f.originals,{inspection:{inspect:async()=>({verdict:'clean',engine:'injected',policy:'test'})}},new AbortController().signal),{status:409});
 const g=workerFixture();await processDocumentJob('extract',g.store,g.originals,{ocr:{engine:'injected',pages:async()=>[{text:'invoice',confidence:101}]}},new AbortController().signal);assert.equal(g.receipts[0].pages,null);assert.equal(g.receipts[0].failure,'UNAVAILABLE');
});
test('PDF/XLSX exports fetch authorized server report and preserve exact decimal cells',async()=>{
 const {exportVat}=loadSource('lib/server/saas/exports');let calls=0;const svc={vatReport:async()=>{calls++;return {period:{startsOn:'2026-10-01',endsOn:'2026-10-31',currency:'GBP'},groups:[{direction:'purchase',treatment:'standard',rate:'20',net:'100.00',vat:'20.00',gross:'120.00'}]};}};
 await assert.rejects(exportVat(svc,scope,{},'xlsx'),{status:403});assert.equal(calls,0);
 const xlsx=await exportVat(svc,{...scope,permission:'reports:export'},{},'xlsx'),XLSX=require('xlsx'),book=XLSX.read(xlsx.bytes);assert.equal(book.Sheets['Confirmed VAT'].F2.v,'120.00');
 const pdf=await exportVat(svc,{...scope,permission:'reports:export'},{},'pdf');assert.ok(Buffer.from(pdf.bytes).subarray(0,5).toString()==='%PDF-');
});
test('invoice export uses authorized server snapshots; spreadsheet text is never a formula',async()=>{
 const {exportInvoice}=loadSource('lib/server/saas/exports');let reads=0;const svc={exportInvoice:async()=>{reads++;return {companyId:company,reference:"=cmd|' /C calc!A0",invoice:{number:'=HYPERLINK("https://invalid.test")',state:'confirmed',issued_on:'2026-10-26',gross:'120.00',net:'100.00',vat:'20.00',supplier_name:'@SUM(1,1)',supplier_email:'accounts@example.test',supplier_phone:'',supplier_address:'1 Test Street',supplier_vat_number:'',currency:'GBP',contact_snapshot:{name:'Supplier'}},taxReview:{evidencedVat:null,evidenceStatus:'not-evidenced / pending review',claimStatus:'review-required',taxTreatment:'unknown'},payment:{status:'unpaid / due',method:null,amountPaid:'0.00',balanceDue:'120.00'},lines:[{position:1,description:'=1+1',quantity:'2.00',unit_price:'50.00',discount:'0.00',treatment:'not-evidenced',rate:'0.00',pricing:'exclusive',net:'100.00',vat:'0.00',gross:'100.00'}]};}};
 await assert.rejects(exportInvoice(svc,scope,contact,'xlsx'),{status:403});assert.equal(reads,0);
 const output=await exportInvoice(svc,{...scope,permission:'reports:export'},contact,'xlsx'),XLSX=require('xlsx'),book=XLSX.read(output.bytes),summary=book.Sheets['Invoice'],lines=book.Sheets['Items'];
 // Readable layout: "Invoice" (label / value rows) and "Items" (one row per line).
 assert.deepEqual(book.SheetNames,['Invoice','Items']);
 assert.equal(summary.B2.v,'\'=HYPERLINK("https://invalid.test")');assert.equal(summary.B2.f,undefined);assert.equal(summary.B3.v,"'@SUM(1,1)");assert.equal(summary.B3.f,undefined);
 assert.equal(summary.B12.v,100);assert.equal(summary.B13.v,20);assert.equal(summary.B14.v,120);
 assert.equal(lines.B2.v,"'=1+1");assert.equal(lines.B2.f,undefined);assert.equal(lines.E2.v,'Not shown');assert.equal(lines.G2.v,'');
 // No cell anywhere in the workbook is a formula.
 for(const name of book.SheetNames)for(const [ref,cell] of Object.entries(book.Sheets[name]))if(!ref.startsWith('!'))assert.equal(cell.f,undefined,name+' '+ref);
});
test('worker store rejects a normal web role before claiming any lease',async()=>{
 const {documentWorkerStore}=loadSource('lib/server/saas/worker-store'),calls=[];const store=documentWorkerStore({query:async sql=>{calls.push(sql);return {rows:[{database:'vtv_saas_dev',host:'127.0.0.1',port:55440,role:'vtv_saas_runtime',session_role:'vtv_saas_runtime',installation:'test',safe:true}]};}},'test');await assert.rejects(store.claim('inspect'),{status:503});assert.equal(calls.length,1);assert.ok(!calls[0].includes('claim_inspection'));
});
test('Stage B migration parses offline; all tenant tables FORCE RLS and no route is enabled',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/003_stage_b_invoices.review.sql','utf8'),{parse}=require('libpg-query');const ast=await parse(sql);assert.ok(ast.version>=170000&&ast.version<180000);for(const match of sql.matchAll(/LANGUAGE sql[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g))await parse(match[1]);
 const tables=[...sql.matchAll(/CREATE TABLE business\.(\w+)\(/g)].map(m=>m[1]);assert.equal(tables.length,17);for(const t of tables.filter(t=>t!=='migrations'))assert.ok(sql.includes(`'${t}'`));assert.ok(sql.includes('FORCE ROW LEVEL SECURITY'));assert.ok(sql.includes('SKIP LOCKED'));assert.ok(sql.includes('WITH CHECK(false)'));assert.ok(!/GRANT.*business\.finish_.*TO vtv_saas_runtime/.test(sql));
 const {privateRouteDecision}=loadSource('lib/server/private-routing');assert.equal((await privateRouteDecision(new Request('https://localhost:3444/api/business/invoices'),false,async()=>({}))).kind,'deny');assert.ok(fs.readFileSync('app/api/business/[...segments]/route.ts','utf8').includes('manualInvoicesEnabled'));
 const manifest=JSON.parse(fs.readFileSync('database/migrations/saas/stage-b.manifest.json'));assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),manifest.sha256);assert.equal(manifest.status,'REVIEW_ONLY_NOT_EXECUTED');
});
test('review-only invoice soft-delete migration is guarded, checksummed, and preserves row history',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/032_invoice_draft_soft_delete.review.sql','utf8'),{parse}=require('libpg-query'),candidate=require('../scripts/saas-reviewed-migration.cjs').candidate('032-invoice-soft-delete');
 const ast=await parse(sql);assert.ok(ast.version>=170000&&ast.version<180000);assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),candidate.hash);assert.match(sql,/current_database\(\)<>'vtv_saas_dev'/);assert.match(sql,/host\(inet_server_addr\(\)\)<>'127\.0\.0\.1'/);assert.match(sql,/session_user<>'vtv_saas_operator'/);assert.match(sql,/state='draft'/);assert.match(sql,/business\.invoice_revisions/);assert.match(sql,/invoice\.delete/);assert.match(sql,/GRANT UPDATE\(deleted_at,deleted_by,version,updated_at\)/);assert.doesNotMatch(sql,/DELETE\s+FROM\s+business\.invoices/i);
});

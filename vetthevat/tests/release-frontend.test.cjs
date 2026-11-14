const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const {validateCustomer,customerInvoices}=loadSource('lib/customers');
const {emptyWorkspace,loadLocalWorkspace}=loadSource('lib/workspace-bootstrap');
const {serializeWorkspace,restoreWorkspace}=loadSource('lib/workspace');
const {previewInvoiceUsage,expiryPreview,validateSubscriptionPreview,defaultSubscriptionPreview}=loadSource('tests/fixtures/subscription-preview');
const {createInvoiceDraft,validateInvoice,findDuplicateInvoice}=loadSource('lib/invoice-rules');
const {calculateLine,calculateInvoiceTotals,buildVATBreakdown}=loadSource('lib/vat-calculations');
const {createReportWorkbook}=loadSource('lib/report-exports');
const {filterInvoices}=loadSource('lib/invoice-filters');
const XLSX=require('xlsx');
const company={id:'company',name:'Synthetic Issuer',vatNumber:'',currency:'GBP'};
const customer={id:'customer',companyId:company.id,name:'Synthetic Customer',email:'',phone:'',address:'',vatNumber:'',status:'Active'};
function sale(){const row=createInvoiceDraft(company),line=calculateLine({description:'Synthetic service',quantity:1,unitPrice:100,discount:0,vatRate:20,taxClassification:'Taxable'});return {...row,transactionType:'Sale',supplierName:company.name,customerId:customer.id,customerName:customer.name,invoiceNumber:'SALE-001',invoiceDate:'2026-10-20',createdAt:'2026-10-20T12:00:00Z',lineItems:[line],...calculateInvoiceTotals([line]),vatBreakdown:buildVATBreakdown([line])};}
test('customers validate company-scoped duplicates, persist and retain history snapshots',()=>{
 assert.equal(validateCustomer(customer,[]).length,0);
 assert.ok(validateCustomer({...customer,id:'another'},[customer]).length);
 assert.equal(validateCustomer({...customer,id:'another',companyId:'other'},[customer]).length,0);
 const invoice=sale(),state={...emptyWorkspace(),companies:[company],selectedCompanyId:company.id,customers:[customer],invoices:[invoice]};
 const restored=restoreWorkspace(serializeWorkspace(state),emptyWorkspace());
 assert.equal(restored.customers[0].name,customer.name);
 assert.equal(customerInvoices({...customer,name:'Changed name'},restored.invoices).length,1);
 assert.equal(customerInvoices({...customer,companyId:'other'},restored.invoices).length,0);
 assert.equal(restored.invoices[0].customerName,customer.name);
 assert.equal(loadLocalWorkspace({getItem:()=>serializeWorkspace(restored)}).customers.length,1);
});
test('sales require a customer, preserve tax arithmetic/classification and export customer linkage',()=>{
 const invoice=sale();assert.deepEqual(validateInvoice(invoice),[]);
 assert.ok(validateInvoice({...invoice,customerName:''}).some(message=>message.includes('customer')));
 assert.equal(findDuplicateInvoice({...invoice,id:'new'},[invoice]).id,invoice.id);
 assert.equal(findDuplicateInvoice({...invoice,id:'new',supplierName:'Issuer edited'},[invoice]).id,invoice.id);
 assert.equal(findDuplicateInvoice({...invoice,id:'new',transactionType:'Purchase'},[invoice]),undefined);
 const filtered=filterInvoices([invoice,{...invoice,id:'purchase',transactionType:'Purchase'}],{companyId:company.id,transactionType:'Sale',query:customer.name});assert.equal(filtered.length,1);
 const book=createReportWorkbook([invoice],[],company,{approval:'All'});
 const rows=XLSX.utils.sheet_to_json(book.Sheets['VAT Transactions']);assert.equal(rows[0]['Customer ID'],customer.id);assert.equal(rows[0].Customer,customer.name);assert.equal(rows[0]['Gross Amount'],120);
 assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Invoice Line Items'])[0]['Tax Classification'],'Taxable');
});
test('local usage counts unique creation IDs across companies and never manufactures a billing period',()=>{
 const invoice=sale();assert.equal(previewInvoiceUsage([invoice],'',''),null);
 const usage=previewInvoiceUsage([invoice,invoice,{...invoice,id:'other',companyId:'other'}, {...invoice,id:'old',createdAt:'2026-09-30T23:59:59Z'},{...invoice,id:'edge',createdAt:'2026-11-01T00:00:00Z'}],'2026-10-01','2026-11-01');
 assert.equal(usage.used,2);assert.equal(usage.remaining,98);
 assert.throws(()=>previewInvoiceUsage([],'2026-02-30','2026-03-01'));
 assert.throws(()=>validateSubscriptionPreview({...defaultSubscriptionPreview,renewalMethod:'Paid'}));
 assert.equal(expiryPreview(''),null);
 assert.equal(expiryPreview('2026-10-21',Date.parse('2026-10-20T00:00:00Z')).days,1);
 assert.equal(expiryPreview('2026-10-19',Date.parse('2026-10-20T00:00:00Z')).severity,'expired');
});
test('quota rejects zero counted reservations and rate policies reject duplicate buckets before store access',async()=>{
 const {reserveInvoiceAllowance}=loadSource('lib/server/account-usage');const {enforceRequestLimits}=loadSource('lib/server/request-limits');
 const id='11111111-1111-4111-8111-111111111111';
 await assert.rejects(reserveInvoiceAllowance({userId:id,companyId:id,invoiceId:id},{resolve:async()=>({accountId:id,active:true,plan:"Starter",period:{start:'2026-10-01',end:'2026-11-01'}})},{reserve:async()=>({allowed:true,used:0,reserved:0,reservationId:'x'})},Date.parse('2026-10-20')),error=>error.status===503);
 let called=false;const bucket={key:'account:trusted',limit:10,windowMs:60000};
 await assert.rejects(enforceRequestLimits({consume:async()=>{called=true;return {allowed:true,retryAfterSeconds:0};}},[bucket,bucket]),error=>error.status===503);assert.equal(called,false);
});

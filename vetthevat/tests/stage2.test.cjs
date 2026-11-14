const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { loadSource } = require('./load-source.cjs');
const { buildReport } = loadSource('lib/reporting');
const { createReportWorkbook, createReportPdf } = loadSource('lib/report-exports');
const { createInvoiceDraft } = loadSource('lib/invoice-rules');
const { calculateLine, calculateInvoiceTotals, buildVATBreakdown } = loadSource('lib/vat-calculations');
const { restoreWorkspace, serializeWorkspace, persistWorkspace, validateCompany, validateSupplier, validateMember } = loadSource('lib/workspace');
const company = { id: 'synthetic-company', name: 'Synthetic Business', registrationNumber: '', vatNumber: '', address: '', country: 'United Kingdom', currency: 'GBP', industry: '', status: 'Active' };
function invoice(id, price, extra = {}) {
  const lineItems = [calculateLine({ description: 'Synthetic goods', quantity: 1, unitPrice: price, discount: 0, vatRate: 20 })];
  return { ...createInvoiceDraft(company), id, supplierId: 'synthetic-supplier', supplierName: 'Synthetic Supplier', invoiceNumber: id, invoiceDate: '2026-10-15', lineItems, ...calculateInvoiceTotals(lineItems), vatBreakdown: buildVATBreakdown(lineItems), status: 'Reviewed', processingStatus: 'Confirmed', reviewStatus: 'Reviewed', ...extra };
}
const rows = [invoice('INCLUDED-GBP', 100), invoice('INCLUDED-EUR', 50, { currency: 'EUR' }), invoice('FOREIGN-SECRET', 900, { companyId: 'other-company' }), invoice('OLD-INVOICE', 300, { invoiceDate: '2026-09-01' }), invoice('DRAFT-INVOICE', 20, { status: 'Draft', processingStatus: 'Ready for Review', reviewStatus: 'Needs Review' })];
const filters = { dateFrom: '2026-10-01', dateTo: '2026-10-31', approval: 'Reviewed' };
test('report filters apply company/date/approval/status/supplier and keep currencies separate', () => {
  const report = buildReport(rows, [], company, filters);
  assert.deepEqual(report.rows.map(item => item.id), ['INCLUDED-EUR', 'INCLUDED-GBP']);
  assert.deepEqual(report.currencies, [{currency:'EUR',count:1,net:50,vat:10,gross:60},{currency:'GBP',count:1,net:100,vat:20,gross:120}]);
  assert.equal(buildReport(rows,[],company,{...filters,currency:'GBP',supplierId:'synthetic-supplier',status:'Reviewed'}).rows.length,1);
  assert.equal(buildReport(rows,[],company,{...filters,approval:'Needs Review'}).rows[0].id,'DRAFT-INVOICE');
  assert.equal(buildReport(rows,[],company,{...filters,supplierId:'missing'}).rows.length,0);
  assert.throws(()=>buildReport(rows,[],company,{dateFrom:'2026-11-01',dateTo:'2026-10-01'}));
  assert.throws(()=>buildReport(rows,[],company,{dateFrom:'2026-02-31'}));
});
test('record updates immediately change monthly/supplier/status summaries', () => {
  const report=buildReport([invoice('UPDATED',200)],[],company,{approval:'Reviewed'});
  assert.equal(report.currencies[0].gross,240);
  assert.equal(report.monthly[0].gross,240);assert.equal(report.suppliers[0].net,200);
  assert.deepEqual(report.statuses,[{status:'Reviewed',count:1}]);
});

test('report date inputs normalize before inclusive comparison and reject reversed ranges', () => {
  const report=buildReport(rows,[],company,{dateFrom:'1/10/2026',dateTo:'31/10/2026',approval:'Reviewed'});
  assert.equal(report.rows.length,2);
  assert.throws(()=>buildReport(rows,[],company,{dateFrom:'2/11/2026',dateTo:'15/10/2026'}));
});

test('1000-row XLSX and multi-page PDF preserve counts and per-currency totals', () => {
  const many=Array.from({length:1000},(_,i)=>invoice('LARGE-'+String(i).padStart(4,'0'),0.335,{currency:i%2?'EUR':'GBP'}));
  const report=buildReport(many,[],company,{approval:'Reviewed'});
  assert.deepEqual(report.currencies.map(x=>[x.count,x.net,x.vat,x.gross]),[[500,170,35,205],[500,170,35,205]]);
  const workbook=createReportWorkbook(many,[],company,{approval:'Reviewed'});
  const reread=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
  assert.equal(XLSX.utils.sheet_to_json(reread.Sheets['VAT Transactions']).length,1000);
  const pdf=createReportPdf(many,company,{approval:'Reviewed'});
  assert.ok(pdf.getNumberOfPages()>50);
  const bytes=Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  assert.ok(bytes.includes('LARGE-0000'));assert.ok(bytes.includes('LARGE-0999'));
});
test('actual XLSX workbook roundtrip matches report records/totals and excludes foreign company', () => {
  const workbook=createReportWorkbook(rows,[],company,filters,'http://localhost');
  const reread=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
  const transactions=XLSX.utils.sheet_to_json(reread.Sheets['VAT Transactions']);
  const summary=XLSX.utils.sheet_to_json(reread.Sheets['VAT Summary']);
  assert.equal(transactions.length,2);assert.ok(transactions.every(item=>item['Company ID']===company.id));
  assert.deepEqual(summary.map(item=>[item.Currency,item['Net Amount'],item['VAT Amount'],item['Gross Amount']]),[['EUR',50,10,60],['GBP',100,20,120]]);
  assert.equal(transactions.some(item=>item['Invoice Number']==='FOREIGN-SECRET'),false);
  assert.throws(()=>createReportWorkbook([],[],company,filters));
});
test('actual PDF content matches selection/currency summaries, excludes foreign rows and supports filename search', async () => {
  const {DOMMatrix,ImageData,Path2D}=require('@napi-rs/canvas');
  global.DOMMatrix=DOMMatrix;global.ImageData=ImageData;global.Path2D=Path2D;
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc=createReportPdf(rows,company,filters);
  const loading=pdfjs.getDocument({data:new Uint8Array(doc.output('arraybuffer')),useSystemFonts:true});
  const pdf=await loading.promise;
  try {let text='';for(let page=1;page<=pdf.numPages;page++){const content=await(await pdf.getPage(page)).getTextContent();text+=content.items.map(item=>item.str??'').join(' ');}
    assert.match(text,/INCLUDED-GBP/);assert.match(text,/INCLUDED-EUR/);assert.doesNotMatch(text,/FOREIGN-SECRET|OLD-INVOICE|DRAFT-INVOICE/);
    assert.match(text,/GBP: Net 100\.00 \| VAT 20\.00 \| Gross 120\.00/);assert.match(text,/EUR: Net 50\.00 \| VAT 10\.00 \| Gross 60\.00/);
  }finally{await loading.destroy();}
  assert.ok(createReportPdf([invoice('FILE',1,{documentId:'source'})],company,{query:'synthetic.pdf'},[{id:'source',fileName:'synthetic.pdf'}]).getNumberOfPages());
  assert.throws(()=>createReportPdf([],company));
});
function defaults(){return {invoices:[invoice('LEGACY',100)],documents:[{id:'source',fileName:'synthetic.pdf',localPreviewUrl:'blob:synthetic',textContent:'Synthetic OCR'}],companies:[company],suppliers:[{id:'synthetic-supplier',name:'Synthetic Supplier',email:'',phone:'',vatNumber:'',address:'',status:'Active'}],teamMembers:[],tickets:[],auditLog:[],notifications:[],settings:{},selectedCompanyId:company.id};}
test('legacy workspace upgrade preserves Stage 1 invoices and derives supplier company association',()=>{
  const state=restoreWorkspace(JSON.stringify({invoices:defaults().invoices,documents:defaults().documents}),defaults());
  assert.equal(state.invoices[0].id,'LEGACY');assert.equal(state.suppliers[0].companyId,company.id);
  assert.equal(state.companies[0].id,company.id);
  const reread=restoreWorkspace(serializeWorkspace(state),defaults());
  assert.equal(reread.documents[0].localPreviewUrl,undefined);assert.equal(reread.documents[0].textContent,undefined);
  assert.equal(reread.invoices[0].totalAmount,120);
});
test('all business state roundtrips without reseeding deliberately empty arrays',()=>{
  const state={...defaults(),suppliers:[],teamMembers:[{id:'draft',companyId:company.id,name:'Synthetic',email:'synthetic@example.test',role:'Viewer',status:'Invitation Draft',lastActive:'Never'}],tickets:[{id:'ticket',companyId:company.id,subject:'Synthetic question',messages:[{author:'Local',body:'Test reply'}],created:'2026-10-15',lastUpdate:'2026-10-15',status:'Open'}],settings:{[company.id]:{profileName:'Synthetic Profile',email:'synthetic@example.test',notificationsEnabled:false}}};
  const restored=restoreWorkspace(serializeWorkspace(state),defaults());
  assert.deepEqual(restored.suppliers,[]);assert.equal(restored.teamMembers[0].status,'Invitation Draft');assert.equal(restored.tickets[0].messages[0].body,'Test reply');assert.equal(restored.settings[company.id].notificationsEnabled,false);
  assert.throws(()=>restoreWorkspace('{bad-json',defaults()));
});
test('persistence failure throws before callers can publish success',()=>{
  const state=defaults();const storage={setItem(){throw new Error('Synthetic quota failure');}};assert.throws(()=>persistWorkspace(storage,state),/quota/);assert.equal(state.invoices[0].id,'LEGACY');
});
test('company/supplier/member validation is scoped and does not merge identities',()=>{
  assert.ok(validateCompany({...company,name:''},[company]).length);
  const supplier={...defaults().suppliers[0],companyId:company.id};
  assert.ok(validateSupplier({...supplier,id:'new'},[supplier]).length);
  assert.deepEqual(validateSupplier({...supplier,id:'new',companyId:'other-company'},[supplier]),[]);
  assert.ok(validateSupplier({...supplier,vatNumber:'?'},[]).length);
  const member={id:'member',companyId:company.id,name:'Synthetic',email:'synthetic@example.test',role:'Finance',status:'Invitation Draft',lastActive:'Never'};
  assert.deepEqual(validateMember(member,[]),[]);assert.ok(validateMember({...member,id:'new'},[member]).length);
});

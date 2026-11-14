const test=require('node:test');const assert=require('node:assert/strict');const {loadSource}=require('./load-source.cjs');
const {dashboardOverview}=loadSource('lib/dashboard-overview');const {buildReport}=loadSource('lib/reporting');
function invoice(id,currency,type,net,vat,extra={}){return {id,companyId:'synthetic',invoiceNumber:id,invoiceDate:'2026-10-16',supplierName:'Synthetic',supplierId:'synthetic',currency,transactionType:type,subtotal:net,vatAmount:vat,totalAmount:net+vat,status:'Reviewed',reviewStatus:'Reviewed',processingStatus:'Confirmed',lineItems:[],vatBreakdown:[],...extra};}
test('dashboard separates explicit directions/currencies and preserves unclassified VAT',()=>{
 const rows=[invoice('p','GBP','Purchase',100,20),invoice('s','GBP','Sale',250,50),invoice('unknown','GBP',undefined,50,10),invoice('e','EUR','Purchase',10,2)];
 const before=JSON.stringify(rows), result=dashboardOverview(rows);
 const gbp=result.currencies.find(row=>row.currency==='GBP');assert.equal(gbp.purchases.gross,120);assert.equal(gbp.sales.gross,300);assert.equal(gbp.unclassified.gross,60);assert.equal(gbp.unclassified.vat,10);assert.equal(gbp.recordedVatDifference,30);assert.equal(result.currencies.find(row=>row.currency==='EUR').recordedVatDifference,-2);assert.equal(JSON.stringify(rows),before);
});
test('dashboard position excludes drafts/unconfirmed and never invents direction from a zero rate',()=>{
 const result=dashboardOverview([invoice('unknown','GBP',undefined,5,0),invoice('draft','GBP','Sale',100,20,{status:'Draft'}),invoice('pending','GBP','Purchase',200,40,{reviewStatus:'Needs Review'})]);
 assert.equal(result.excludedCount,2);assert.equal(result.currencies[0].recordedVatDifference,null);assert.equal(result.currencies[0].unclassified.count,1);assert.equal(result.currencies[0].sales.count,0);
 assert.deepEqual(dashboardOverview([]),{excludedCount:0,currencies:[]});
});
test('dashboard consumes the existing company/period/currency report selection without changing rounding',()=>{
 const rows=[invoice('selected','GBP','Sale',0.10,0.02),invoice('purchase','GBP','Purchase',0.05,0.01),invoice('foreign','GBP','Sale',1000,200,{companyId:'other'}),invoice('old','GBP','Sale',100,20,{invoiceDate:'2025-01-01'})];
 const report=buildReport(rows,[],{id:'synthetic',name:'Synthetic'}, {dateFrom:'2026-01-01',currency:'GBP'});
 assert.equal(dashboardOverview(report.rows).currencies[0].recordedVatDifference,0.01);
});

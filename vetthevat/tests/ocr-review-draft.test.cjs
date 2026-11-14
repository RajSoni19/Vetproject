const test=require('node:test'),assert=require('node:assert/strict'),{loadSource}=require('./load-source.cjs'),{ocrReviewDraft}=loadSource('lib/ocr-review-draft'),{calculateVat}=loadSource('lib/server/saas/vat');
test('multi-page OCR suggestions retain unresolved fields and explicit review, without guessing supplier/date/VAT',()=>{const d=ocrReviewDraft([{observations:{extraction:{supplierName:'Synthetic Supplier',invoiceNumber:'SYN-1',invoiceDate:'2026-11-11',currency:'GBP',lines:[{description:'Synthetic item',quantity:'2',unitPrice:'10.00',vatRate:'20',taxClassification:'Taxable'}],warnings:['Review source']}}},{observations:{extraction:{lines:[{description:'Unresolved',quantity:null,unitPrice:null,vatRate:null}]}}}]);assert.equal(d.number,'SYN-1');assert.equal(d.lines.length,2);assert.equal(d.lines[1].rate,'');assert.equal(d.lines[1].quantity,'');assert.equal(d.reviewRequired,true);assert.ok(d.warnings.includes('Review source'));});
test('conflicting OCR header values stay blank instead of silently selecting a page',()=>{const d=ocrReviewDraft([{observations:{extraction:{invoiceNumber:'A',supplierName:'One'}}},{observations:{extraction:{invoiceNumber:'B',supplierName:'Two'}}}]);assert.equal(d.number,'');assert.equal(d.supplierName,'');});
test('INV-000110 VAT omission remains an explicit unreviewed treatment and reconciles without inferred VAT',()=>{
 const names=['Red onion 10kg','Onions -20kg','Button mushroom','Piper','Peeld garlic Box','Bird eye chilli','Spinich (PALAK)','Aubergine 400','Cabbage','Coriandar','Vine tomato','Mint Bunches'];
 const prices=['12.00','15.00','9.00','18.00','45.00','15.00','14.50','11.50','16.00','10.50','12.00','8.00'];
 const quantities=['1.00','1.00','1.00','1.00','1.00','1.00','2.00','2.00','1.00','1.00','1.00','1.00'];
 const draft=ocrReviewDraft([{observations:{extraction:{supplierName:'RK Fruits & Vegetables Limited',invoiceNumber:'INV-000110',vat:null,vatEvidence:'not-evidenced',lines:names.map((description,index)=>({description,quantity:quantities[index],unitPrice:prices[index],net:(Number(quantities[index])*Number(prices[index])).toFixed(2),vatRate:null,taxClassification:null}))}}}]);
 assert.equal(draft.supplierName,'RK Fruits & Vegetables Limited');assert.equal(draft.number,'INV-000110');assert.equal(draft.vatEvidenceStatus,'not-evidenced');
 assert.equal(draft.lines.length,12);assert.ok(draft.lines.every(line=>line.treatment==='not-evidenced'&&line.rate===''));
 const calculated=calculateVat(draft.lines.map(line=>({...line,rate:'0'})),{currency:'GBP',kind:'invoice',rounding:'line-half-up'});
 assert.equal(calculated.gross,'212.50');assert.equal(calculated.net,'212.50');assert.equal(calculated.vat,'0.00');
 assert.ok(calculated.lines.every(line=>line.treatment==='not-evidenced'&&line.vat==='0.00'));
});

const test=require('node:test'),assert=require('node:assert/strict'),{loadSource}=require('./load-source.cjs'),{parseExtraction}=loadSource('lib/server/stage1/extraction');

test('separated item descriptions and numeric rows populate supported invoice fields without inferred VAT',()=>{
 const names=['Red onions','Brown onions','Button mushrooms','Green peppers','Peeled garlic','Bird eye chilli','Spinach','Aubergines','Produce item nine','Cabbage','Coriander','Vine tomatoes'];
 const numbers=Array.from({length:12},(_,i)=>`${i+1}.00 1.00 ${(i+1).toFixed(2)}`);
 const text=['Supplier: Example Produce Limited','Invoice # EX-12','Invoice Date 26/10/2026','Due Date 26/10/2026','Currency GBP','# Item',...names,'Qty Rate Amount',...numbers,'Sub Total 78.00','Total £78.00'].join('\n');
 const result=parseExtraction(text,[{id:'00000000-0000-4000-8000-000000000001',name:'Example Produce Limited',vatNumber:''}]);
 assert.equal(result.supplierName,'Example Produce Limited');
 assert.equal(result.supplierId,'00000000-0000-4000-8000-000000000001');
 assert.equal(result.invoiceNumber,'EX-12');
 assert.equal(result.invoiceDate,'2026-10-26');
 assert.equal(result.dueDate,'2026-10-26');
 assert.equal(result.currency,'GBP');
 assert.equal(result.net,'78.00');
 assert.equal(result.gross,'78.00');
 assert.equal(result.vat,null);
 assert.equal(result.vatEvidence,'not-evidenced');
 assert.equal(result.lines.length,12);
 assert.deepEqual(result.lines.map(line=>line.description),names);
 assert.deepEqual(result.lines.map(line=>line.net),numbers.map((_,i)=>(i+1).toFixed(2)));
 assert.ok(result.warnings.includes('VAT not evidenced — review required'));
});

test('unreconciled description counts do not shift item names onto the wrong amounts',()=>{
 const result=parseExtraction(['# Item','1 | First item','Unnumbered possible item','2 | Second item','Qty Rate Amount','1.00 10.00 10.00','2.00 15.00 30.00','Sub Total 40.00','Total £40.00'].join('\n'));
 assert.equal(result.lines.length,2);
 assert.equal(result.lines[0].description,'First item');
 assert.equal(result.lines[1].description,'Second item');
 assert.ok(result.warnings.some(w=>w.includes('descriptions and numeric rows do not reconcile')));
});

test('multi-column invoice headers retain seller, invoice number, dates and totals',()=>{
 const text=[
  'RK FRUITS & VEGETABLES LIMITED',
  'INVOICE',
  'Bill To                                                                  Invoice#                  INV-000110',
  'Mumbai Fusion                                                            Invoice Date              26/10/2026',
  'Due Date                  26/10/2026',
  'HSBC Business account                                                                      Sub Total                  212.50',
  'Name: RK Fruits & Vegetables Limited                                                          Total                  £212.50',
 ].join('\n');
 const result=parseExtraction(text);
 assert.equal(result.supplierName,'RK Fruits & Vegetables Limited');
 assert.equal(result.invoiceNumber,'INV-000110');
 assert.equal(result.invoiceDate,'2026-10-26');
 assert.equal(result.dueDate,'2026-10-26');
 assert.equal(result.currency,'GBP');
 assert.equal(result.net,'212.50');
 assert.equal(result.gross,'212.50');
 assert.equal(result.vat,null);
});

test('positioned OCR words reconcile separated table descriptions with their amount rows',()=>{
 const names=['Red onions','Brown onions','Mushrooms','Peppers','Garlic','Chilli','Spinach','Aubergines','Cabbage','Coriander','Tomatoes','Mint'];
 const words=[{text:'Qty',left:600,top:100,width:28,height:12},{text:'Rate',left:700,top:100,width:30,height:12},{text:'Amount',left:800,top:100,width:48,height:12}];
 for(let i=0;i<names.length;i++){const y=130+i*25;words.push({text:String(i+1),left:40,top:y,width:8,height:12},{text:names[i],left:100,top:y,width:80,height:12},{text:i===6||i===7?'2.00':'1.00',left:600,top:y,width:30,height:12},{text:i===6?'14.50':i===7?'11.50':'10.00',left:700,top:y,width:35,height:12},{text:i===6?'29.00':i===7?'23.00':'10.00',left:800,top:y,width:35,height:12});}
 const text=['Supplier: Example Produce Limited','Invoice # EX-12','Invoice Date 26/10/2026','Due Date 26/10/2026','Currency GBP','# Item',...names.map((name,i)=>`${i+1} ${name} 1.00 10.00 10.00`),'Qty Rate Amount','Sub Total 142.00','Total £142.00'].join('\n');
 const result=parseExtraction(text,[],{words});
 assert.equal(result.lines.length,12);
 assert.deepEqual(result.lines.map(line=>line.description),names);
 assert.deepEqual(result.lines.map(line=>line.quantity),names.map((_,i)=>i===6||i===7?'2.00':'1.00'));
 assert.deepEqual(result.lines.map(line=>line.unitPrice),names.map((_,i)=>i===6?'14.50':i===7?'11.50':'10.00'));
 assert.equal(result.vat,null);
 assert.ok(!result.warnings.some(w=>w.includes('descriptions and numeric rows do not reconcile')));
});

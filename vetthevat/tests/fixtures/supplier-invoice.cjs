const header=['Supplier: Synthetic Fasteners Ltd','Invoice Number: SYN-LINES-2026','Invoice Date: 30/10/2026','Due Date: 30/11/2026','Currency: GBP'];
const columns='Description | SKU | Qty | Unit | Unit Price | Discount | VAT % | VAT Amount | Line Total';
const pages=[{page:1,confidence:96,text:[...header,columns,'Steel bolt | BOLT-1 | 2 | EA | 10.00 | 1.00 | 20% | 3.80 | 19.00','Mystery part | UNKNOWN | 1 | EA | 5.00 | 0.00 | 0% | 0.00 | 5.00'].join('\n')},{page:2,confidence:92,text:[columns,'Steel bolt | BOLT-1 | 1 | EA | 10.00 | 0.00 | 20% | 2.00 | 10.00','Subtotal: 34.00','VAT: 5.80','Total: 39.80'].join('\n')}];
module.exports={pages,header,columns};

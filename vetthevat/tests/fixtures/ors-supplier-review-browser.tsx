// Browser component acceptance fixture: HTTP boundaries are simulated explicitly.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {OrsSupplierInvoices} from '../../components/ors-supplier-invoices';
import {extractSupplierInvoice,supplierInvoiceIssues,matchSupplierProducts} from '../../lib/ors-invoice-extraction';
const id='123e4567-e89b-42d3-a456-426614174000',supplier='223e4567-e89b-42d3-a456-426614174000';
const pages=[{page:1,confidence:96,text:'Supplier: Synthetic Supplier\nInvoice Number: SYN-BROWSER\nInvoice Date: 30/10/2026\nDue Date: 30/11/2026\nCurrency: GBP\nDescription | SKU | Qty | Unit | Unit Price | Discount | VAT % | VAT Amount | Line Total\nSteel bolt | B1 | 2 | EA | 10.00 | 0.00 | 20% | 4.00 | 20.00\nMystery part | X9 | 1 | EA | 5.00 | 0.00 | 0% | 0.00 | 5.00'},{page:2,confidence:70,text:'Description | SKU | Qty | Unit | Unit Price | Discount | VAT % | VAT Amount | Line Total\nSteel bolt | B1 | 1 | EA | 10.00 | 0.00 | 20% | 2.00 | 10.00\nSubtotal: 35.00\nVAT: 6.00\nTotal: 42.00'}];
const source=extractSupplierInvoice(pages),materials=[{id,sku:'B1',name:'Steel bolt',unit:'EA',state:'active'}];
let review:Record<string,any>={state:'extracted',version:1,payload:source,source,supplier_id:null,purchase_order_id:null,acknowledgements:[]};
const events:Record<string,any>[]=[];(window as any).supplierTest={events,source};
window.fetch=async(input,init)=>{const path=String(input),body=init?.body instanceof File?init.body:typeof init?.body==='string'?JSON.parse(init.body):undefined;events.push({path,method:init?.method,body});let data:any;
 if(path==='/api/auth/session')return Response.json({csrfToken:'synthetic-csrf'});
 if(path==='/api/ors/supplier-invoices')data=[];
 else if(path.startsWith('/api/business/documents?'))data={items:[{id,original_name:'synthetic-two-page.pdf',state:'clean',extraction:'completed'}],nextCursor:null};
 else if(path.endsWith('/status'))data={state:'clean',extraction:'completed'};
 else if(path.endsWith('/purpose'))data={purpose:'ors',version:1};
 else if(path==='/api/business/documents')data={id,state:'quarantined'};
 else if(path.endsWith('/match'))data=matchSupplierProducts(body.lines,materials);
 else if(path==='/api/ors/materials')data={id:'new-product'};
 else if(path.endsWith('/'+id)&&body){const issues=supplierInvoiceIssues(body.invoice);if(body.confirm&&issues.some(i=>!body.acknowledgements.includes(i)))return Response.json({error:{message:'Unacknowledged discrepancy'}},{status:409});review={...review,payload:body.invoice,supplier_id:body.supplierId,state:body.confirm?'confirmed':'draft',version:Number(review.version)+1};data={state:review.state,version:review.version,issues};}
 else if(path.endsWith('/'+id))data=review;
 else throw Error('Unexpected fixture request: '+path);
 return Response.json({data});
};
createRoot(document.getElementById('root')!).render(<OrsSupplierInvoices companyId={id} suppliers={[{id:supplier,name:'Synthetic Supplier'}]} materials={materials} orders={[]} onCatalogueChange={async()=>{}}/>);

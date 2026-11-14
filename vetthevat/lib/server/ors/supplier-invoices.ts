import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {businessAudit,businessCommand,invoiceConflict} from "@/lib/server/saas/invoices";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";
import {extractSupplierInvoice,matchSupplierProducts,supplierInvoiceIssues,supplierPoIssues,type SupplierExtraction,type SupplierLine,type OcrPage} from "@/lib/ors-invoice-extraction";

export const supplierInvoicesSchemaSha256='c6e177cf5a18fe8a2856d1ac0d3450ccc8d00addc32355eb50a9a535453d5ba9';
export const supplierInvoicesEnabled=(env:Readonly<Record<string,string|undefined>>)=>env.SAAS_ORS_SUPPLIER_INVOICES_ENABLED==='1'&&env.SAAS_ORS_SUPPLIER_INVOICES_SCHEMA_SHA256===supplierInvoicesSchemaSha256;
const fail=(message:string):never=>{throw new ApiError(400,'INVALID_REQUEST',message);};
const safeText=(v:unknown,max=500,nullable=true):string|null=>{if(nullable&&(v===null||v===''))return null;if(typeof v!=='string'||v.length>max||/[\u0000-\u001f\u007f]/.test(v))return fail('Invalid supplier invoice field.');return v.trim();};
function reviewInput(value:unknown,source:SupplierExtraction){
 const v=objectBody(value,['invoice','supplierId','purchaseOrderId','acknowledgements','confirm']);
 const raw=objectBody(v.invoice,['supplier','invoiceNumber','invoiceDate','dueDate','currency','subtotal','vat','total','lines','warnings']);
 const invoice={...source,lines:[] as SupplierLine[]};
 for(const key of ['supplier','invoiceNumber','invoiceDate','dueDate','currency','subtotal','vat','total'] as const)invoice[key]=safeText(raw[key]);
 if(!Array.isArray(raw.lines)||raw.lines.length<1||raw.lines.length>500)fail('Review one to 500 supplier invoice lines.');
 invoice.lines=(raw.lines as unknown[]).map((item,index)=>{
  const r=objectBody(item,['description','sku','quantity','unit','unitPrice','discount','vatRate','vatAmount','lineTotal','materialId','poPosition','evidence']);
  const line={...source.lines[index]} as SupplierLine;
  for(const key of ['description','sku','quantity','unit','unitPrice','discount','vatRate','vatAmount','lineTotal'] as const){const text=safeText(r[key],key==='description'?2000:200,key!=='description');if(key==='description')line.description=text!;else line[key]=text;}
  line.materialId=r.materialId?uuid(r.materialId).toLowerCase():null;
  line.poPosition=r.poPosition===null||r.poPosition===undefined?null:Number(r.poPosition);
  if(line.poPosition!==null&&(!Number.isSafeInteger(line.poPosition)||line.poPosition<1))fail('Invalid PO line position.');
  // Original evidence is always server-owned; browser edits cannot replace it.
  line.evidence=source.lines[index]?.evidence??{page:0,row:index+1,text:'Manually entered during review',confidence:null};return line;
 });
 if(!Array.isArray(v.acknowledgements)||v.acknowledgements.some(a=>typeof a!=='string'||a.length>3000))fail('Invalid discrepancy acknowledgements.');
 if(typeof v.confirm!=='boolean')fail('Choose draft or confirmation.');
 return {invoice,supplierId:v.supplierId?uuid(v.supplierId).toLowerCase():null,purchaseOrderId:v.purchaseOrderId?uuid(v.purchaseOrderId).toLowerCase():null,acknowledgements:v.acknowledgements as string[],confirm:v.confirm};
}
export function supplierInvoiceService(database:CompanyDatabase){
 const access=<T>(scope:CompanyScope,write:boolean,work:Parameters<CompanyDatabase['scoped']>[1])=>{if(scope.permission!==(write?'procurement:write':'procurement:read'))throw new ApiError(403,'FORBIDDEN','Supplier invoice permission required.');return database.scoped(scope,work) as Promise<T>;};
 return {
  list(scope:CompanyScope){return access(scope,false,async tx=>(await tx.query('SELECT document_id::text,state,version,payload,supplier_id::text,purchase_order_id::text FROM operations.supplier_invoice_reviews WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 100',[tx.companyId])).rows);},
  load(scope:CompanyScope,documentValue:string){const id=uuid(documentValue);return access(scope,false,async tx=>{
   const document=(await tx.query("SELECT d.id FROM saas.documents d WHERE d.company_id=$1 AND d.id=$2 AND d.state='clean' AND saas.authorized_company(d.company_id,'documents:read') AND EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version AND i.sha256=d.sha256 AND i.verdict='clean')",[tx.companyId,id])).rows[0];
   if(!document)throw new ApiError(409,'CONFLICT','Wait for trusted clean inspection before extracting.');
   const saved=(await tx.query('SELECT state,version,payload,source,supplier_id::text,purchase_order_id::text,acknowledgements,issues FROM operations.supplier_invoice_reviews WHERE company_id=$1 AND document_id=$2',[tx.companyId,id])).rows[0];if(saved)return saved;
   const pages=(await tx.query("SELECT r.page,r.observations FROM business.extraction_results r JOIN business.extraction_jobs j ON j.company_id=r.company_id AND j.id=r.job_id JOIN saas.documents d ON d.company_id=j.company_id AND d.id=j.document_id AND d.sha256=j.sha256 AND d.object_version=j.object_version WHERE j.company_id=$1 AND j.document_id=$2 AND j.state='completed' AND j.id=(SELECT id FROM business.extraction_jobs WHERE company_id=$1 AND document_id=$2 AND state='completed' ORDER BY created_at DESC LIMIT 1) ORDER BY r.page",[tx.companyId,id])).rows;
   if(!pages.length)throw new ApiError(409,'CONFLICT','OCR is queued or processing. Refresh when extraction completes.');
   const source=extractSupplierInvoice(pages.map(p=>{const o=p.observations as OcrPage;return {page:Number(p.page),text:o.text,confidence:o.confidence};}));
   const products=(await tx.query("SELECT id::text,sku,name FROM operations.materials WHERE company_id=$1 AND state='active'",[tx.companyId])).rows as {id:string;sku:string;name:string}[];
   return {state:'extracted',version:1,payload:{...source,lines:matchSupplierProducts(source.lines,products)},source,supplier_id:null,purchase_order_id:null,acknowledgements:[]};
  });},
  match(scope:CompanyScope,value:unknown){const v=objectBody(value,['supplierId','lines']);const supplierId=uuid(v.supplierId);if(!Array.isArray(v.lines)||v.lines.length>500)fail('Invalid matching lines.');return access(scope,false,async tx=>{
   const products=(await tx.query("SELECT id::text,sku,name FROM operations.materials WHERE company_id=$1 AND state='active'",[tx.companyId])).rows as {id:string;sku:string;name:string}[];
   const mappings=(await tx.query('SELECT supplier_code,material_id::text FROM operations.supplier_product_mappings WHERE company_id=$1 AND supplier_id=$2',[tx.companyId,supplierId])).rows as {supplier_code:string;material_id:string}[];
   if(process.env.SAAS_ORS_SHOPPING_ENABLED==='1'){const existing=(await tx.query("SELECT supplier_sku AS supplier_code,material_id::text FROM operations.shopping_supplier_products WHERE company_id=$1 AND supplier_id=$2 AND active AND supplier_sku IS NOT NULL",[tx.companyId,supplierId])).rows as {supplier_code:string;material_id:string}[];mappings.push(...existing);}
   const lines=(v.lines as unknown[]).map(row=>{const r=row as SupplierLine;if(!r||typeof r.description!=='string'||r.sku!==null&&typeof r.sku!=='string')return fail('Invalid matching product.');return r;});
   return matchSupplierProducts(lines,products,mappings);
  });},
  rememberMapping(scope:CompanyScope,value:unknown,key:string){const v=objectBody(value,['supplierId','materialId','supplierCode']),supplierId=uuid(v.supplierId),materialId=uuid(v.materialId),code=safeText(v.supplierCode,80,false)!.normalize('NFKC').toUpperCase();if(!code)fail('Supplier code required.');return access(scope,true,tx=>businessCommand(tx,'ors.supplier-product.mapping',key,{supplierId,materialId,code},async()=>{
   if(!(await tx.query("SELECT id FROM operations.materials WHERE company_id=$1 AND id=$2 AND state='active'",[tx.companyId,materialId])).rows[0])fail('Active company product required.');
   if(!(await tx.query("SELECT id FROM business.counterparties WHERE company_id=$1 AND id=$2 AND kind='supplier' AND status='active'",[tx.companyId,supplierId])).rows[0])fail('Active company supplier required.');
   await tx.query('INSERT INTO operations.supplier_product_mappings(company_id,supplier_id,supplier_code,material_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[tx.companyId,supplierId,code,materialId]);const stored=(await tx.query('SELECT material_id::text FROM operations.supplier_product_mappings WHERE company_id=$1 AND supplier_id=$2 AND supplier_code=$3',[tx.companyId,supplierId,code])).rows[0];if(stored?.material_id!==materialId)invoiceConflict('This supplier code already maps to another product. Existing mapping was preserved.');await businessAudit(tx,'ors.supplier-product.mapping-confirmed',materialId);return {materialId,supplierCode:code};
  }));},
  save(scope:CompanyScope,documentValue:string,value:unknown,key:string,version:number,source:SupplierExtraction){const id=uuid(documentValue),input=reviewInput(value,source);return access(scope,true,tx=>businessCommand(tx,'ors.supplier-invoice.review',key,{id,version,input},async()=>{
   const safe=(await tx.query("SELECT id FROM saas.documents d WHERE company_id=$1 AND id=$2 AND state='clean' AND saas.authorized_company(company_id,'documents:read') AND EXISTS(SELECT 1 FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.sha256=d.sha256 AND i.object_version=d.object_version AND i.verdict='clean') FOR SHARE",[tx.companyId,id])).rows[0];if(!safe)throw new ApiError(409,'CONFLICT','Verified clean original required.');
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8735))',[`${tx.companyId}:${id}`]);
   const old=(await tx.query('SELECT state,version FROM operations.supplier_invoice_reviews WHERE company_id=$1 AND document_id=$2 FOR UPDATE',[tx.companyId,id])).rows[0];
   if(old?.state==='confirmed'||(old?Number(old.version)!==version:version!==1))invoiceConflict('Invoice is confirmed or has changed. Reopen the current review.');
   if(!input.supplierId)fail('Select the company supplier.');
   const supplier=(await tx.query("SELECT id FROM business.counterparties WHERE company_id=$1 AND id=$2 AND kind='supplier' AND status='active'",[tx.companyId,input.supplierId])).rows[0];if(!supplier)fail('Select an active supplier in this company.');
   const issues=supplierInvoiceIssues(input.invoice);
   if(input.invoice.lines.length<source.lines.length)fail('Preserve every extracted row; correct it in review.');
   for(const line of input.invoice.lines)if(line.materialId&&!(await tx.query("SELECT id FROM operations.materials WHERE company_id=$1 AND id=$2 AND state='active'",[tx.companyId,line.materialId])).rows[0])fail('Select an active product in this company.');
   if(input.purchaseOrderId){const po=(await tx.query('SELECT supplier_id::text FROM operations.purchase_orders WHERE company_id=$1 AND id=$2',[tx.companyId,input.purchaseOrderId])).rows[0];if(!po||po.supplier_id!==input.supplierId)fail('Purchase order must belong to this supplier and company.');
    const poLines=(await tx.query('SELECT position,material_id::text,quantity::text FROM operations.purchase_order_lines WHERE company_id=$1 AND purchase_order_id=$2',[tx.companyId,input.purchaseOrderId])).rows;
    issues.push(...supplierPoIssues(input.invoice.lines,poLines.map(p=>({position:Number(p.position),materialId:String(p.material_id),quantity:String(p.quantity)}))));
   }else if(input.invoice.lines.some(l=>l.poPosition!==null))fail('Select a purchase order for PO line matching.');
   if(input.confirm&&issues.some(issue=>!input.acknowledgements.includes(issue)))throw new ApiError(409,'CONFLICT','Correct or explicitly acknowledge every current discrepancy before confirmation.');
   if(input.confirm){const identity=`${tx.companyId}:${input.supplierId}:${input.invoice.invoiceNumber?.trim().toLowerCase()}`;await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8736))',[identity]);if((await tx.query("SELECT document_id FROM operations.supplier_invoice_reviews WHERE company_id=$1 AND supplier_id=$2 AND state='confirmed' AND lower(btrim(payload->>'invoiceNumber'))=lower(btrim($3)) AND document_id<>$4",[tx.companyId,input.supplierId,input.invoice.invoiceNumber,id])).rows[0])invoiceConflict('A confirmed supplier invoice with this supplier and number already exists.');}
   const state=input.confirm?'confirmed':'draft';
   const row=(await tx.query(`INSERT INTO operations.supplier_invoice_reviews(company_id,document_id,supplier_id,purchase_order_id,payload,source,acknowledgements,issues,state,updated_by) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
    ON CONFLICT(company_id,document_id) DO UPDATE SET supplier_id=excluded.supplier_id,purchase_order_id=excluded.purchase_order_id,payload=excluded.payload,acknowledgements=excluded.acknowledgements,issues=excluded.issues,state=excluded.state,version=operations.supplier_invoice_reviews.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING state,version`,[tx.companyId,id,input.supplierId,input.purchaseOrderId,JSON.stringify(input.invoice),JSON.stringify(source),JSON.stringify(input.acknowledgements),JSON.stringify(issues),state,tx.actorId])).rows[0];
   await businessAudit(tx,`ors.supplier-invoice.${state}`,id);return {...row,issues};
  }));}
 };
}

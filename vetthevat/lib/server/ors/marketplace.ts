import {createHash,randomUUID} from "node:crypto";
import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {businessCommand,businessAudit} from "@/lib/server/saas/invoices";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import {decimal,lineAmounts,sumAmounts,offerUsable,phoneDigits,whatsappMessage,twoDecimalCurrency,currencyAmount,type Offer} from "@/lib/ors-marketplace";

async function ready(tx:CompanyTransaction){return (await tx.query("SELECT to_regclass('operations.shopping_supplier_offers') IS NOT NULL AND to_regclass('operations.shopping_supplier_whatsapp') IS NOT NULL AND to_regclass('operations.shopping_dispatches') IS NOT NULL AND to_regclass('operations.shopping_dispatch_lines') IS NOT NULL AS ready")).rows[0]?.ready===true;}
async function offers(tx:CompanyTransaction){return (await tx.query(`SELECT o.* FROM operations.shopping_supplier_offers o JOIN operations.shopping_catalogue c ON c.company_id=o.company_id AND c.material_id=o.material_id AND c.listed JOIN operations.materials m ON m.company_id=o.company_id AND m.id=o.material_id AND m.state='active' JOIN operations.shopping_supplier_products sp ON sp.company_id=o.company_id AND sp.material_id=o.material_id AND sp.supplier_id=o.supplier_id AND sp.active JOIN business.counterparties s ON s.company_id=o.company_id AND s.id=o.supplier_id AND s.kind='supplier' AND s.status='active' WHERE o.company_id=$1 AND o.state='active' ORDER BY o.verified_at DESC,o.id`,[tx.companyId])).rows as unknown as Offer[];}
async function quote(tx:CompanyTransaction,id:string,lock=false){
 const req=(await tx.query(`SELECT id::text,version,requested_by::text,state FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2 ${lock?'FOR UPDATE':''}`,[tx.companyId,id])).rows[0];
 if(!req||req.requested_by!==tx.actorId)throw new ApiError(404,"INVALID_REQUEST","Cart is unavailable in this company.");
 if(req.state!=="draft")throw new ApiError(409,"CONFLICT","This cart has already been checked out. View shopping orders.");
 const lines=(await tx.query("SELECT l.id::text,l.material_id::text,l.requested_quantity::text AS quantity,l.requested_unit AS unit,l.requested_base_unit AS base_unit,l.requested_base_quantity_per_unit::text AS factor,g.id::text AS group_id,g.supplier_id::text,s.name AS supplier_name,m.name,m.sku FROM operations.shopping_requisition_lines l JOIN operations.shopping_supplier_groups g ON g.company_id=l.company_id AND g.id=l.supplier_group_id JOIN business.counterparties s ON s.company_id=g.company_id AND s.id=g.supplier_id JOIN operations.materials m ON m.company_id=l.company_id AND m.id=l.material_id WHERE l.company_id=$1 AND g.requisition_id=$2 AND l.state='pending' ORDER BY g.id,l.position",[tx.companyId,id])).rows;
 const current=await offers(tx);
 const phones=(await tx.query(`SELECT supplier_id::text,phone_e164 FROM operations.shopping_supplier_whatsapp WHERE company_id=$1 AND revoked_at IS NULL`,[tx.companyId])).rows;
 const groups:Record<string,{id:string;supplierId:string;supplierName:string;phone:string|null;currency:string;issues:string[];lines:ReturnType<typeof priced>[];subtotal:string;vat:string;total:string}>={};
 function priced(l:Record<string,unknown>,offer:Offer|undefined){return {id:String(l.id),materialId:String(l.material_id),name:String(l.name),sku:String(l.sku),quantity:String(l.quantity),unit:String(l.unit),offer:offer??null,...(offer?lineAmounts(offer,String(l.quantity)):{subtotal:"0.00",vat:"0.00",total:"0.00"})};}
 for(const l of lines){
  const groupId=String(l.group_id),supplierId=String(l.supplier_id);
  const group=groups[groupId]??={id:groupId,supplierId,supplierName:String(l.supplier_name),phone:phones.find(p=>p.supplier_id===supplierId)?.phone_e164 as string??null,currency:"",issues:[],lines:[],subtotal:"0.00",vat:"0.00",total:"0.00"};
  const offer=current.find(o=>o.material_id===l.material_id&&o.supplier_id===supplierId&&o.unit_code===l.unit);
  if(!offer||offer.base_unit!==l.base_unit||decimal(offer.base_quantity_per_unit)!==decimal(String(l.factor))||!offerUsable(offer,String(l.quantity)))group.issues.push(`${l.name}: a current available quote, matching pack, minimum quantity and sufficient supplier stock are required.`);
  if(offer){if(group.currency&&group.currency!==offer.currency)group.issues.push("A supplier order must use one currency.");group.currency=offer.currency;}
  group.lines.push(priced(l,offer));
 }
 for(const group of Object.values(groups)){
  // Aggregate repeated material lines before checking stock / MOQ.
  const quantities=new Map<string,bigint>();for(const line of group.lines)if(line.offer)quantities.set(line.offer.id,(quantities.get(line.offer.id)??BigInt(0))+decimal(line.quantity));
  for(const line of group.lines)if(line.offer&&line.offer.available_quantity!==null&&decimal(line.offer.available_quantity)<(quantities.get(line.offer.id)??BigInt(0)))group.issues.push(`${line.name}: combined quantity exceeds available stock.`);
  try{phoneDigits(group.phone??"");}catch{group.issues.push("Supplier WhatsApp number is missing or invalid; record a verified international number.");}
  Object.assign(group,sumAmounts(group.lines));
 }
 const result={requisitionId:id,version:Number(req.version),groups:Object.values(groups)};
 return {...result,fingerprint:createHash("sha256").update(JSON.stringify(result)).digest("hex")};
}
export function marketplaceService(database:CompanyDatabase){
 const scoped=<T>(scope:CompanyScope,permission:"procurement:read"|"procurement:write"|"procurement:approve",work:(tx:CompanyTransaction)=>Promise<T>)=>{if(scope.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company permission required.");return database.scoped(scope,async tx=>{if(tx.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company permission required.");return work(tx);});};
 return {
 async configureOffer(scope:CompanyScope,value:unknown,key:string){
  const b=objectBody(value,["materialId","supplierId","unit","unitPrice","currency","vatRate","includesVat","minimumQuantity","availableQuantity","validUntil","sourceReference"]),material=uuid(b.materialId),supplier=uuid(b.supplierId);
  const numeric=(v:unknown,positive=false,places=6)=>{if(typeof v!=="string"||!new RegExp(`^\\d{1,12}(?:\\.\\d{1,${places}})?$`).test(v)||positive&&decimal(v)<=BigInt(0))throw new ApiError(400,"INVALID_REQUEST","Enter a valid nonnegative decimal within the supported range.");return v;};
  const price=numeric(b.unitPrice),vat=numeric(b.vatRate,false,2),minimum=numeric(b.minimumQuantity,true,4),available=numeric(b.availableQuantity,false,4);
  if(Number(vat)>100||typeof b.includesVat!=="boolean"||typeof b.currency!=="string"||!twoDecimalCurrency(b.currency)||typeof b.unit!=="string"||!["pcs","kg","g","l","box"].includes(b.unit)||typeof b.validUntil!=="string"||!Number.isFinite(Date.parse(b.validUntil))||Date.parse(b.validUntil)<=Date.now()||typeof b.sourceReference!=="string"||!b.sourceReference.trim()||b.sourceReference.length>300)throw new ApiError(400,"INVALID_REQUEST","Provide currency with two decimal places, explicit VAT treatment, a future expiry and supplier quote evidence.");
  return scoped(scope,"procurement:approve",async tx=>{if(!await ready(tx))throw new ApiError(503,"UNAVAILABLE","Marketplace migration requires approval.");return businessCommand(tx,"ors.shopping.offer.configure",key,b,async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,836))",[tx.companyId]);
   const unit=(await tx.query("SELECT u.base_unit,u.base_quantity_per_unit::text FROM operations.shopping_units u JOIN operations.shopping_supplier_products sp ON sp.company_id=u.company_id AND sp.material_id=u.material_id AND sp.supplier_id=$3 AND sp.active JOIN business.counterparties s ON s.company_id=sp.company_id AND s.id=sp.supplier_id AND s.kind='supplier' AND s.status='active' WHERE u.company_id=$1 AND u.material_id=$2 AND u.unit_code=$4",[tx.companyId,material,supplier,b.unit])).rows[0];
   if(!unit)throw new ApiError(400,"INVALID_REQUEST","Select an existing company product, supplier mapping and configured pack.");
   const row=(await tx.query("INSERT INTO operations.shopping_supplier_offers(company_id,material_id,supplier_id,unit_code,base_unit,base_quantity_per_unit,unit_price,currency,vat_rate,price_includes_vat,minimum_order_quantity,available_quantity,availability_state,source_reference,valid_until,verified_by,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16) RETURNING id::text",[tx.companyId,material,supplier,b.unit,unit.base_unit,unit.base_quantity_per_unit,price,b.currency,vat,b.includesVat,minimum,available,Number(available)>0?"available":"unavailable",b.sourceReference,b.validUntil,tx.actorId])).rows[0];
   await businessAudit(tx,"ors.shopping.offer_verified",String(row.id));return row;
  });});
 },
 async configureWhatsapp(scope:CompanyScope,value:unknown,key:string){
  const b=objectBody(value,["supplierId","phone","method","sourceReference"]),supplier=uuid(b.supplierId);
  try{phoneDigits(typeof b.phone==="string"?b.phone:"");}catch(e){throw new ApiError(400,"INVALID_REQUEST",(e as Error).message);}
  if(!["supplier_call","supplier_written_confirmation","official_whatsapp_business"].includes(String(b.method))||typeof b.sourceReference!=="string"||!b.sourceReference.trim()||b.sourceReference.length>300)throw new ApiError(400,"INVALID_REQUEST","Record how the supplier WhatsApp number was independently verified.");
  return scoped(scope,"procurement:approve",async tx=>{if(!await ready(tx))throw new ApiError(503,"UNAVAILABLE","Marketplace migration requires approval.");return businessCommand(tx,"ors.shopping.whatsapp.configure",key,b,async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,836))",[tx.companyId]);
   if(!(await tx.query("SELECT id FROM business.counterparties WHERE company_id=$1 AND id=$2 AND kind='supplier' AND status='active'",[tx.companyId,supplier])).rows.length)throw new ApiError(400,"INVALID_REQUEST","Select an active supplier in this company.");
   await tx.query("INSERT INTO operations.shopping_supplier_whatsapp(company_id,supplier_id,phone_e164,verification_method,source_reference,verified_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,supplier_id) WHERE revoked_at IS NULL DO UPDATE SET phone_e164=EXCLUDED.phone_e164,verification_method=EXCLUDED.verification_method,source_reference=EXCLUDED.source_reference,verified_by=EXCLUDED.verified_by,verified_at=now(),version=operations.shopping_supplier_whatsapp.version+1,updated_at=now()",[tx.companyId,supplier,b.phone,b.method,b.sourceReference,tx.actorId]);
   await businessAudit(tx,"ors.shopping.whatsapp_verified",supplier);return {supplierId:supplier};
  });});
 },
 async offers(scope:CompanyScope){return scoped(scope,"procurement:read",async tx=>await ready(tx)?{ready:true,items:await offers(tx)}:{ready:false,items:[],reason:"Verified supplier pricing and WhatsApp ordering are not configured. Your cart can still be saved; ask a company administrator to enable ordering."});},
 async quote(scope:CompanyScope,id:string){return scoped(scope,"procurement:read",async tx=>{if(!await ready(tx))throw new ApiError(503,"UNAVAILABLE","Verified pricing and order storage migration has not been approved and enabled.");return quote(tx,uuid(id));});},
 async checkout(scope:CompanyScope,value:unknown,key:string,expected:number){
  const b=objectBody(value,["requisitionId","fingerprint"]),id=uuid(b.requisitionId);if(typeof b.fingerprint!=="string"||! /^[a-f0-9]{64}$/.test(b.fingerprint))throw new ApiError(400,"INVALID_REQUEST","Revalidate the cart before checkout.");
  return scoped(scope,"procurement:write",async tx=>{if(!await ready(tx))throw new ApiError(503,"UNAVAILABLE","Verified pricing and order storage migration has not been approved and enabled.");return businessCommand(tx,"ors.shopping.checkout",key,{id,fingerprint:b.fingerprint,expected},async()=>{
   // Match existing cart mutation locks, including addLine's actor lock.
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,833))",[tx.companyId+tx.actorId]);
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[id]);
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,836))",[tx.companyId]);
   const q=await quote(tx,id,true);
   if(q.version!==expected||q.fingerprint!==b.fingerprint)throw new ApiError(409,"CONFLICT","Prices, stock or cart changed. Revalidate and review totals before checkout.");
   if(!q.groups.length||q.groups.some(g=>g.issues.length))throw new ApiError(400,"INVALID_REQUEST","Resolve supplier prices, quantities and phone numbers before checkout.");
   const company=(await tx.query("SELECT name FROM saas.company_context($1)",[tx.companyId])).rows[0];if(!company)throw new ApiError(404,"INVALID_REQUEST","Company unavailable.");
   const orders=[];
   for(const group of q.groups){
    const dispatchId=randomUUID(),reference="ORS-"+dispatchId.replaceAll("-","").slice(0,20).toUpperCase();
    await tx.query("INSERT INTO operations.shopping_dispatches(id,company_id,requisition_id,supplier_group_id,supplier_id,order_reference,currency,subtotal,vat_amount,total_amount,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[dispatchId,tx.companyId,id,group.id,group.supplierId,reference,group.currency,group.subtotal,group.vat,group.total,tx.actorId]);
    let position=0;for(const line of group.lines){const o=line.offer!;await tx.query("INSERT INTO operations.shopping_dispatch_lines(company_id,dispatch_id,position,material_id,offer_id,supplier_id,currency,product_name,sku,quantity,unit_code,base_unit,base_quantity_per_unit,unit_price,vat_rate,price_includes_vat,subtotal,vat_amount,total_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",[tx.companyId,dispatchId,++position,line.materialId,o.id,group.supplierId,o.currency,line.name,line.sku,line.quantity,line.unit,o.base_unit,o.base_quantity_per_unit,o.unit_price,o.vat_rate,o.price_includes_vat,line.subtotal,line.vat,line.total]);}
    const message=whatsappMessage(String(company.name),group.supplierName,reference,group.currency,group.lines.map(l=>({name:l.name,sku:l.sku,quantity:l.quantity,unit:l.unit,unitPrice:currencyAmount(l.offer!.unit_price),vatRate:l.offer!.vat_rate,includesVat:l.offer!.price_includes_vat,total:l.total})),group);
    orders.push({id:dispatchId,reference,supplierName:group.supplierName,state:"pending_dispatch",message,url:`https://wa.me/${phoneDigits(group.phone!)}?text=${encodeURIComponent(message)}`});
    await businessAudit(tx,"ors.shopping.order_draft_created",dispatchId);
   }
   // Close this cart without claiming dispatch; the supplier drafts stay pending.
   await tx.query("UPDATE operations.shopping_requisitions SET state='accepted',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,id]);
   return {orders};
  });});
 },
 async shoppingOrders(scope:CompanyScope,id?:string){return scoped(scope,"procurement:read",async tx=>{
  if(!await ready(tx))return {ready:false,items:[]};
  const items=(await tx.query("SELECT d.id::text,d.order_reference,d.state,d.currency,d.subtotal::text,d.vat_amount::text,d.total_amount::text,d.created_at::text,s.name AS supplier_name FROM operations.shopping_dispatches d JOIN business.counterparties s ON s.company_id=d.company_id AND s.id=d.supplier_id WHERE d.company_id=$1 AND ($2::uuid IS NULL OR d.id=$2) ORDER BY d.created_at DESC LIMIT 100",[tx.companyId,id?uuid(id):null])).rows;
  if(id&&!items.length)throw new ApiError(404,"INVALID_REQUEST","Order unavailable in this company.");
  const lines=id?(await tx.query("SELECT product_name,sku,quantity::text,unit_code,unit_price::text,vat_rate::text,price_includes_vat,subtotal::text,vat_amount::text,total_amount::text FROM operations.shopping_dispatch_lines WHERE company_id=$1 AND dispatch_id=$2 ORDER BY position",[tx.companyId,id])).rows:[];
  let actions:unknown[]=[];
  if(id&&items[0]){
   const contact=(await tx.query("SELECT w.phone_e164,c.name AS company_name FROM operations.shopping_dispatches d JOIN operations.shopping_supplier_whatsapp w ON w.company_id=d.company_id AND w.supplier_id=d.supplier_id AND w.revoked_at IS NULL JOIN LATERAL saas.company_context(d.company_id) c ON true WHERE d.company_id=$1 AND d.id=$2",[tx.companyId,id])).rows[0];
   if(contact){
    const order=items[0],message=whatsappMessage(String(contact.company_name),String(order.supplier_name),String(order.order_reference),String(order.currency),lines.map(l=>({name:String(l.product_name),sku:String(l.sku),quantity:String(l.quantity),unit:String(l.unit_code),unitPrice:currencyAmount(String(l.unit_price)),vatRate:String(l.vat_rate),includesVat:l.price_includes_vat===true,total:currencyAmount(String(l.total_amount))})),{subtotal:currencyAmount(String(order.subtotal)),vat:currencyAmount(String(order.vat_amount)),total:currencyAmount(String(order.total_amount))});
    try{actions=[{id,reference:order.order_reference,supplierName:order.supplier_name,state:order.state,message,url:`https://wa.me/${phoneDigits(String(contact.phone_e164))}?text=${encodeURIComponent(message)}`}];}catch{/* Keep order history readable if contact data needs repair. */}
   }
  }
  return {ready:true,items,lines,actions};
 });}
 };}

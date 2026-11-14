import {randomUUID} from "node:crypto";
import {marketplaceService} from "@/lib/server/ors/marketplace";
import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {businessAudit,businessCommand,invoiceConflict} from "@/lib/server/saas/invoices";
import {observationUnitPrice,type VerifiedPriceLine} from "@/lib/server/procurement/prices";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import type {CompanyPermission} from "@/lib/server/saas/permissions";

type Unit="pcs"|"kg"|"g"|"l"|"box";
const unitCodes:readonly Unit[]=["pcs","kg","g","l","box"];
function scoped<T>(database:CompanyDatabase,scope:CompanyScope,permission:CompanyPermission,work:(tx:CompanyTransaction)=>Promise<T>){
 if(scope.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company permission required.");
 return database.scoped(scope,async tx=>{if(tx.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company permission required.");return work(tx);});
}
function text(value:unknown,max:number,label:string,optional=false):string|null{
 if(optional&&(value===undefined||value===null||value===""))return null;
 if(typeof value!=="string"||value.trim().length<1||value.length>max)throw new ApiError(400,"INVALID_REQUEST",`Invalid ${label}.`);
 return value.trim();
}
function quantity(value:unknown):string{
 const source=typeof value==="number"&&Number.isFinite(value)?String(value):value;
 if(typeof source!=="string"||! /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(source)||Number(source)<=0)throw new ApiError(400,"INVALID_REQUEST","Quantity must be a positive decimal with at most four places.");
 return source;
}
function unitPrice(value:unknown):string|null{
 if(value===undefined||value===null||value==="")return null;
 const source=typeof value==="number"&&Number.isFinite(value)?String(value):value;
 if(typeof source!=="string"||! /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(source))throw new ApiError(400,"INVALID_REQUEST","Unit price must be zero or a positive decimal with at most four places.");
 return source;
}
function unit(value:unknown):Unit{if(typeof value!=="string"||!unitCodes.includes(value as Unit))throw new ApiError(400,"INVALID_REQUEST","Choose pcs, kg, g, l, or box.");return value as Unit;}
function version(value:unknown):number{const n=typeof value==="string"&&/^\d{1,9}$/.test(value)?Number(value):value;if(typeof n!=="number"||!Number.isSafeInteger(n)||n<1)throw new ApiError(400,"INVALID_REQUEST","A current requisition version is required.");return n;}
function eventInput(value:unknown,allowed:readonly string[]){return objectBody(value,allowed);}
async function addEvent(tx:CompanyTransaction,requisitionId:string,action:string,details:Record<string,unknown>={}){
 await tx.query("INSERT INTO operations.shopping_events(company_id,requisition_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5::jsonb)",[tx.companyId,requisitionId,tx.actorId,action,JSON.stringify(details)]);
 await businessAudit(tx,`ors.shopping.${action}`,requisitionId);
}
async function lockDraft(tx:CompanyTransaction,idValue:unknown,expected:unknown,requesterOnly:boolean){
 const id=uuid(idValue).toLowerCase(),v=version(expected);
 await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[id]);
 const row=(await tx.query("SELECT id::text,requested_by::text,state,version FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,id])).rows[0];
 if(!row||row.state!=="draft"||Number(row.version)!==v||requesterOnly&&String(row.requested_by)!==tx.actorId)invoiceConflict("The draft cart changed; reload it before saving.");
 return row as {id:string;requested_by:string;state:string;version:number};
}
async function cartData(tx:CompanyTransaction,requester=tx.actorId){
 const req=(await tx.query("SELECT id::text,requested_by::text,assigned_buyer_id::text,state,required_on::text,priority,instructions,version,created_at::text,updated_at::text FROM operations.shopping_requisitions WHERE company_id=$1 AND requested_by=$2 AND state='draft' ORDER BY created_at DESC LIMIT 1",[tx.companyId,requester])).rows[0];
 if(!req)return null;
 const groups=(await tx.query("SELECT g.id::text,g.supplier_id::text,c.name AS supplier_name,g.state,g.purchase_request_id::text,g.purchase_order_id::text,g.version,COALESCE(jsonb_agg(jsonb_build_object('id',l.id::text,'materialId',l.material_id::text,'sku',m.sku,'name',m.name,'quantity',l.requested_quantity::text,'unit',l.requested_unit,'baseUnit',l.requested_base_unit,'baseQuantityPerUnit',l.requested_base_quantity_per_unit::text,'note',l.requester_note,'state',l.state) ORDER BY l.position) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS lines FROM operations.shopping_supplier_groups g JOIN business.counterparties c ON c.company_id=g.company_id AND c.id=g.supplier_id LEFT JOIN operations.shopping_requisition_lines l ON l.company_id=g.company_id AND l.supplier_group_id=g.id AND l.state<>'removed' LEFT JOIN operations.materials m ON m.company_id=l.company_id AND m.id=l.material_id WHERE g.company_id=$1 AND g.requisition_id=$2 GROUP BY g.id,c.name ORDER BY c.name,g.id",[tx.companyId,req.id])).rows;
 return {...req,groups};
}
async function requisitionData(tx:CompanyTransaction,id:string){
 const req=(await tx.query("SELECT id::text,requested_by::text,assigned_buyer_id::text,state,required_on::text,priority,instructions,version,created_at::text,updated_at::text FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2",[tx.companyId,id])).rows[0];
 if(!req)throw new ApiError(404,"INVALID_REQUEST","Requisition is unavailable in this company.");
 const groups=(await tx.query("SELECT g.id::text,g.supplier_id::text,c.name AS supplier_name,g.state,g.purchase_request_id::text,g.purchase_order_id::text,g.version,COALESCE(jsonb_agg(jsonb_build_object('id',l.id::text,'materialId',l.material_id::text,'actualMaterialId',l.actual_material_id::text,'sku',m.sku,'name',m.name,'actualSku',am.sku,'actualName',am.name,'quantity',l.requested_quantity::text,'unit',l.requested_unit,'actualQuantity',l.actual_quantity::text,'actualUnit',l.actual_unit,'actualUnitPrice',l.actual_unit_price::text,'actualCurrency',l.actual_currency,'substitutionNote',l.substitution_note,'buyerNote',l.buyer_note,'note',l.requester_note,'state',l.state) ORDER BY l.position) FILTER(WHERE l.id IS NOT NULL),'[]'::jsonb) AS lines FROM operations.shopping_supplier_groups g JOIN business.counterparties c ON c.company_id=g.company_id AND c.id=g.supplier_id LEFT JOIN operations.shopping_requisition_lines l ON l.company_id=g.company_id AND l.supplier_group_id=g.id LEFT JOIN operations.materials m ON m.company_id=l.company_id AND m.id=l.material_id LEFT JOIN operations.materials am ON am.company_id=l.company_id AND am.id=l.actual_material_id WHERE g.company_id=$1 AND g.requisition_id=$2 GROUP BY g.id,c.name ORDER BY c.name,g.id",[tx.companyId,id])).rows;
 return {...req,groups};
}

export function shoppingQuantity(value:unknown){return quantity(value);}
export function shoppingUnit(value:unknown){return unit(value);}
export function shoppingVersion(value:unknown){return version(value);}

export function shoppingService(database:CompanyDatabase){return {
 ...marketplaceService(database),
 async catalogue(scope:CompanyScope,managed=false){
  if(scope.permission!==(managed?"procurement:approve":"procurement:read"))throw new ApiError(403,"FORBIDDEN","Company permission required.");
  return database.scoped(scope,async tx=>{
  const rows=(await tx.query("SELECT m.id::text AS id,m.sku,m.name,m.unit AS stock_unit,COALESCE(sc.category,'Other') AS category,sc.image_path,sc.price_product_id::text AS price_product_id,COALESCE(sc.listed,false) AS listed,COALESCE(sc.version,1) AS version,COALESCE((SELECT jsonb_agg(jsonb_build_object('code',u.unit_code,'baseUnit',u.base_unit,'baseQuantityPerUnit',u.base_quantity_per_unit::text) ORDER BY CASE u.unit_code WHEN 'pcs' THEN 1 WHEN 'kg' THEN 2 WHEN 'g' THEN 3 WHEN 'l' THEN 4 ELSE 5 END) FROM operations.shopping_units u WHERE u.company_id=m.company_id AND u.material_id=m.id),'[]'::jsonb) AS units,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sp.supplier_id::text,'name',c.name,'source',sp.source,'productName',sp.supplier_product_name,'sku',sp.supplier_sku) ORDER BY c.name) FROM operations.shopping_supplier_products sp JOIN business.counterparties c ON c.company_id=sp.company_id AND c.id=sp.supplier_id AND c.kind='supplier' AND c.status='active' WHERE sp.company_id=m.company_id AND sp.material_id=m.id AND sp.active),'[]'::jsonb) AS suppliers FROM operations.materials m LEFT JOIN operations.shopping_catalogue sc ON sc.company_id=m.company_id AND sc.material_id=m.id WHERE m.company_id=$1 AND ($2::boolean OR sc.listed) AND m.state='active' ORDER BY COALESCE(sc.category,'Other'),m.name,m.sku LIMIT 500",[tx.companyId,managed])).rows;
  const linkedProducts=[...new Set(rows.map(row=>row.price_product_id).filter((id):id is string=>typeof id==='string'))];
  if(!linkedProducts.length)return rows.map(row=>({...row,historicalPrices:[]}));
  const canReadPrices=(await tx.query("SELECT business.scope($1,'invoices:read') OR business.scope($1,'reports:read') AS allowed",[tx.companyId])).rows[0]?.allowed===true;
  if(!canReadPrices)return rows.map(row=>({...row,historicalPrices:[]}));
  const evidence=(await tx.query(`SELECT lm.product_id::text,lm.line_id::text,lm.items_per_pack::text,lm.content_per_item::text,lm.unit,
    l.invoice_id::text,l.quantity::text AS packs,l.net::text,i.contact_id::text AS supplier_id,s.name AS supplier_name,i.issued_on::text AS invoice_date,
    i.currency,l.treatment,l.rate::text
    FROM price_intelligence.line_matches lm
    JOIN price_intelligence.products p ON p.company_id=lm.company_id AND p.id=lm.product_id
    JOIN business.invoice_lines l ON l.company_id=lm.company_id AND l.id=lm.line_id AND l.invoice_id=lm.invoice_id
    JOIN business.invoices i ON i.company_id=l.company_id AND i.id=l.invoice_id
    JOIN business.counterparties s ON s.company_id=i.company_id AND s.id=i.contact_id AND s.kind='supplier'
    WHERE lm.company_id=$1 AND lm.product_id=ANY($2::uuid[]) AND i.state='confirmed' AND i.direction='purchase' AND i.kind='invoice' AND i.currency IN('GBP','EUR','USD')
      AND NOT EXISTS(SELECT 1 FROM business.invoices c WHERE c.company_id=i.company_id AND c.credit_for_id=i.id AND c.state='confirmed')
    ORDER BY i.issued_on DESC,l.id LIMIT 2001`,[tx.companyId,linkedProducts])).rows;
  if(evidence.length>2000)throw new ApiError(400,"INVALID_REQUEST","Narrow ORS price history to a smaller linked catalogue.");
  const history=new Map<string,Record<string,unknown>[]>();
  for(const row of evidence){
   const line:VerifiedPriceLine={id:String(row.line_id),invoiceId:String(row.invoice_id),companyId:tx.companyId,supplierId:String(row.supplier_id),productId:String(row.product_id),variant:"reviewed catalogue product",invoiceDate:String(row.invoice_date),currency:row.currency as VerifiedPriceLine["currency"],vatBasis:"net",deliveryBasis:"excluded",packs:String(row.packs),itemsPerPack:String(row.items_per_pack),contentPerItem:String(row.content_per_item),unit:row.unit as VerifiedPriceLine["unit"],amountMinor:String(BigInt(String(row.net).replace(".",""))),discountMinor:"0",deliveryMinor:"0",reviewed:true,productMatch:"verified",state:"verified",taxTreatment:String(row.treatment)+":"+String(row.rate)};
   const item={supplierId:String(row.supplier_id),supplierName:String(row.supplier_name),date:String(row.invoice_date),currency:line.currency,unitPrice:observationUnitPrice(line),unit:line.unit==="g"||line.unit==="kg"?"kg":line.unit==="ml"||line.unit==="l"?"l":"each",taxTreatment:line.taxTreatment};
   const entries=history.get(String(row.product_id))??[];entries.push(item);history.set(String(row.product_id),entries);
  }
  return rows.map(row=>({...row,historicalPrices:typeof row.price_product_id==="string"?history.get(row.price_product_id)??[]:[]}));
 });},
 async configureListing(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["materialId","listed","category","imagePath","version"]),id=uuid(b.materialId).toLowerCase(),listed=b.listed;
  if(typeof listed!=="boolean")throw new ApiError(400,"INVALID_REQUEST","Catalogue listing state must be explicit.");
  const category=text(b.category,80,"category")!,imagePath=text(b.imagePath,100,"image path",true),expected=version(b.version);
  if(imagePath&&!/^\/ors\/catalogue\/[A-Za-z0-9_-]+\.(?:svg|webp|png|jpg)$/.test(imagePath))throw new ApiError(400,"INVALID_REQUEST","Choose a private-reviewed catalogue asset path.");
  return scoped(database,scope,"procurement:approve",tx=>businessCommand(tx,"ors.shopping.catalogue.configure",key,{id,listed,category,imagePath,expected},async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,834))",[id]);
   const exists=(await tx.query("SELECT version FROM operations.shopping_catalogue WHERE company_id=$1 AND material_id=$2",[tx.companyId,id])).rows[0];
   if(!exists){
    if(expected!==1)invoiceConflict("Catalogue item changed or is unavailable.");
    const created=(await tx.query("INSERT INTO operations.shopping_catalogue(company_id,material_id,listed,category,image_path,version,updated_by) SELECT company_id,id,$3,$4,$5,2,$6 FROM operations.materials WHERE company_id=$1 AND id=$2 AND state='active' RETURNING material_id::text,listed,category,image_path,version",[tx.companyId,id,listed,category,imagePath,tx.actorId])).rows[0];
    if(!created)throw new ApiError(400,"INVALID_REQUEST","Select an active company material.");
    await businessAudit(tx,"ors.shopping.catalogue.configured",id);return created;
   }
   const row=(await tx.query("UPDATE operations.shopping_catalogue SET listed=$4,category=$5,image_path=$6,version=version+1,updated_by=$7,updated_at=now() WHERE company_id=$1 AND material_id=$2 AND version=$3 RETURNING material_id::text,listed,category,image_path,version",[tx.companyId,id,expected,listed,category,imagePath,tx.actorId])).rows[0];
   if(!row)invoiceConflict("Catalogue item changed or is unavailable.");await businessAudit(tx,"ors.shopping.catalogue.configured",id);return row;
  }));
 },
 async configureUnit(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["materialId","unit","baseUnit","baseQuantityPerUnit"]),id=uuid(b.materialId).toLowerCase(),orderUnit=unit(b.unit),baseUnit=text(b.baseUnit,16,"stock unit")!,factor=quantity(b.baseQuantityPerUnit);
  return scoped(database,scope,"procurement:approve",tx=>businessCommand(tx,"ors.shopping.catalogue.unit",key,{id,orderUnit,baseUnit,factor},async()=>{
   const item=(await tx.query("SELECT unit FROM operations.materials WHERE company_id=$1 AND id=$2 AND state='active'",[tx.companyId,id])).rows[0];if(!item)throw new ApiError(400,"INVALID_REQUEST","Select an active company material.");
   if(String(item.unit)!==baseUnit)throw new ApiError(400,"INVALID_REQUEST","Conversion base must match the material's stock unit.");
   const row=(await tx.query("INSERT INTO operations.shopping_units(company_id,material_id,unit_code,base_unit,base_quantity_per_unit,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,material_id,unit_code) DO UPDATE SET base_unit=EXCLUDED.base_unit,base_quantity_per_unit=EXCLUDED.base_quantity_per_unit,version=operations.shopping_units.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING unit_code,base_unit,base_quantity_per_unit::text,version",[tx.companyId,id,orderUnit,baseUnit,factor,tx.actorId])).rows[0];
   await businessAudit(tx,"ors.shopping.catalogue.unit_configured",id);return row;
  }));
 },
 async configureSupplier(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["materialId","supplierId","productName","supplierSku"]),materialId=uuid(b.materialId).toLowerCase(),supplierId=uuid(b.supplierId).toLowerCase(),productName=text(b.productName,200,"supplier product name",true),supplierSku=text(b.supplierSku,80,"supplier SKU",true);
  return scoped(database,scope,"procurement:approve",tx=>businessCommand(tx,"ors.shopping.catalogue.supplier",key,{materialId,supplierId,productName,supplierSku},async()=>{
   const active=(await tx.query("SELECT 1 FROM business.counterparties WHERE company_id=$1 AND id=$2 AND kind='supplier' AND status='active'",[tx.companyId,supplierId])).rows[0];if(!active)throw new ApiError(400,"INVALID_REQUEST","Select an active supplier in this company.");
   const row=(await tx.query("INSERT INTO operations.shopping_supplier_products(company_id,material_id,supplier_id,source,supplier_product_name,supplier_sku,updated_by) VALUES($1,$2,$3,'manager_confirmed',$4,$5,$6) ON CONFLICT(company_id,material_id,supplier_id) DO UPDATE SET source='manager_confirmed',supplier_product_name=EXCLUDED.supplier_product_name,supplier_sku=EXCLUDED.supplier_sku,active=true,version=operations.shopping_supplier_products.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING material_id::text,supplier_id::text,source,supplier_product_name,supplier_sku,version",[tx.companyId,materialId,supplierId,productName,supplierSku,tx.actorId])).rows[0];
   if(!row)throw new ApiError(400,"INVALID_REQUEST","Select an active company material.");await businessAudit(tx,"ors.shopping.catalogue.supplier_configured",materialId);return row;
  }));
 },
 async cart(scope:CompanyScope){return scoped(database,scope,"procurement:read",tx=>cartData(tx));},
 async buyers(scope:CompanyScope){return scoped(database,scope,"procurement:read",async tx=>{
  const items=(await tx.query("SELECT id::text,name,role FROM operations.shopping_buyers($1)",[tx.companyId])).rows;
  const canAssign=(await tx.query("SELECT operations.shopping_assignment_manager($1) AS allowed",[tx.companyId])).rows[0]?.allowed===true;
  return {items,canAssign};
 });},
 async requisition(scope:CompanyScope,idValue:string){const id=uuid(idValue).toLowerCase();return scoped(database,scope,"procurement:read",tx=>requisitionData(tx,id));},
 async addLine(scope:CompanyScope,value:unknown,key:string,expectedVersion:number){
  const b=eventInput(value,["materialId","supplierId","quantity","unit","note"]),input={materialId:uuid(b.materialId).toLowerCase(),supplierId:uuid(b.supplierId).toLowerCase(),quantity:quantity(b.quantity),unit:unit(b.unit),note:text(b.note,500,"item instructions",true)};
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.cart.add",key,{input,expectedVersion},async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,833))",[tx.companyId+tx.actorId]);
   const product=(await tx.query("SELECT u.base_unit,u.base_quantity_per_unit::text FROM operations.shopping_catalogue sc JOIN operations.materials m ON m.company_id=sc.company_id AND m.id=sc.material_id JOIN operations.shopping_units u ON u.company_id=m.company_id AND u.material_id=m.id JOIN operations.shopping_supplier_products sp ON sp.company_id=m.company_id AND sp.material_id=m.id AND sp.supplier_id=$3 AND sp.active JOIN business.counterparties c ON c.company_id=sp.company_id AND c.id=sp.supplier_id AND c.kind='supplier' AND c.status='active' WHERE sc.company_id=$1 AND sc.material_id=$2 AND sc.listed AND m.state='active' AND u.unit_code=$4",[tx.companyId,input.materialId,input.supplierId,input.unit])).rows[0];
   if(!product)throw new ApiError(400,"INVALID_REQUEST","Choose a listed product, active supplier, and explicitly configured order unit.");
   let req=(await tx.query("SELECT id::text,version FROM operations.shopping_requisitions WHERE company_id=$1 AND requested_by=$2 AND state='draft' FOR UPDATE",[tx.companyId,tx.actorId])).rows[0];
   if(!req){const created=(await tx.query("INSERT INTO operations.shopping_requisitions(company_id,requested_by) VALUES($1,$2) RETURNING id::text,version",[tx.companyId,tx.actorId])).rows[0];if(!created)throw new ApiError(503,"UNAVAILABLE","Cart could not be created.");req=created;}
   else if(Number(req.version)!==expectedVersion)invoiceConflict("The cart changed; reload before adding another item.");
   const group=(await tx.query("INSERT INTO operations.shopping_supplier_groups(company_id,requisition_id,supplier_id) VALUES($1,$2,$3) ON CONFLICT(company_id,requisition_id,supplier_id) DO UPDATE SET updated_at=now() RETURNING id::text",[tx.companyId,req.id,input.supplierId])).rows[0];
   const position=(await tx.query("SELECT coalesce(max(position),0)+1 AS n FROM operations.shopping_requisition_lines WHERE company_id=$1 AND supplier_group_id=$2",[tx.companyId,group.id])).rows[0].n;
   const line=(await tx.query("INSERT INTO operations.shopping_requisition_lines(company_id,supplier_group_id,position,material_id,requested_quantity,requested_unit,requested_base_unit,requested_base_quantity_per_unit,requester_note,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text",[tx.companyId,group.id,position,input.materialId,input.quantity,input.unit,product.base_unit,product.base_quantity_per_unit,input.note,tx.actorId])).rows[0];
   await tx.query("UPDATE operations.shopping_requisitions SET version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,req.id]);
   await addEvent(tx,String(req.id),"cart.line_added",{lineId:line.id,supplierId:input.supplierId,materialId:input.materialId});
   return cartData(tx);
  }));
 },
 async updateLine(scope:CompanyScope,value:unknown,key:string,expectedVersion:number){
  const b=eventInput(value,["requisitionId","lineId","quantity","unit","note"]),input={requisitionId:uuid(b.requisitionId).toLowerCase(),lineId:uuid(b.lineId).toLowerCase(),quantity:quantity(b.quantity),unit:unit(b.unit),note:text(b.note,500,"item instructions",true)};
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.cart.update",key,{input,expectedVersion},async()=>{
   await lockDraft(tx,input.requisitionId,expectedVersion,true);
   const unitRow=(await tx.query("SELECT u.base_unit,u.base_quantity_per_unit::text FROM operations.shopping_requisition_lines l JOIN operations.shopping_supplier_groups g ON g.company_id=l.company_id AND g.id=l.supplier_group_id JOIN operations.shopping_units u ON u.company_id=l.company_id AND u.material_id=l.material_id AND u.unit_code=$4 WHERE l.company_id=$1 AND g.requisition_id=$2 AND l.id=$3 AND l.state='pending'",[tx.companyId,input.requisitionId,input.lineId,input.unit])).rows[0];
   if(!unitRow)throw new ApiError(400,"INVALID_REQUEST","This cart line or order unit is unavailable.");
   await tx.query("UPDATE operations.shopping_requisition_lines SET requested_quantity=$4,requested_unit=$5,requested_base_unit=$6,requested_base_quantity_per_unit=$7,requester_note=$8,updated_by=$9,updated_at=now() WHERE company_id=$1 AND id=$2 AND supplier_group_id IN(SELECT id FROM operations.shopping_supplier_groups WHERE company_id=$1 AND requisition_id=$3)",[tx.companyId,input.lineId,input.requisitionId,input.quantity,input.unit,unitRow.base_unit,unitRow.base_quantity_per_unit,input.note,tx.actorId]);
   await tx.query("UPDATE operations.shopping_requisitions SET version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,input.requisitionId]);
   await addEvent(tx,input.requisitionId,"cart.line_updated",{lineId:input.lineId});return cartData(tx);
  }));
 },
 async removeLine(scope:CompanyScope,value:unknown,key:string,expectedVersion:number){
  const b=eventInput(value,["requisitionId","lineId"]),input={requisitionId:uuid(b.requisitionId).toLowerCase(),lineId:uuid(b.lineId).toLowerCase()};
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.cart.remove",key,{input,expectedVersion},async()=>{
   await lockDraft(tx,input.requisitionId,expectedVersion,true);
   const changed=await tx.query("UPDATE operations.shopping_requisition_lines l SET state='removed',updated_by=$4,updated_at=now() FROM operations.shopping_supplier_groups g WHERE l.company_id=$1 AND l.id=$2 AND g.company_id=l.company_id AND g.id=l.supplier_group_id AND g.requisition_id=$3 AND l.state='pending'",[tx.companyId,input.lineId,input.requisitionId,tx.actorId]);
   if(changed.rowCount!==1)invoiceConflict("Cart item is no longer available.");
   await tx.query("UPDATE operations.shopping_requisitions SET version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,input.requisitionId]);
   await addEvent(tx,input.requisitionId,"cart.line_removed",{lineId:input.lineId});return cartData(tx);
  }));
 },
 async assign(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["requisitionId","buyerId","version","requiredOn","priority","instructions"]),input={requisitionId:uuid(b.requisitionId).toLowerCase(),buyerId:uuid(b.buyerId).toLowerCase(),version:version(b.version),requiredOn:text(b.requiredOn,10,"required date",true),priority:text(b.priority,10,"priority")??"normal",instructions:text(b.instructions,2000,"instructions",true)};
  if(!["low","normal","high","urgent"].includes(input.priority))throw new ApiError(400,"INVALID_REQUEST","Choose a valid priority.");
  if(input.requiredOn&&!/^\d{4}-\d{2}-\d{2}$/.test(input.requiredOn))throw new ApiError(400,"INVALID_REQUEST","Required date must use YYYY-MM-DD.");
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.requisition.assign",key,input,async()=>{
   const manager=(await tx.query("SELECT operations.shopping_assignment_manager($1) AS allowed",[tx.companyId])).rows[0]?.allowed;
   if(manager!==true)throw new ApiError(403,"FORBIDDEN","Only a company owner, administrator, or purchasing manager can assign requisitions.");
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[input.requisitionId]);
   const req=(await tx.query("SELECT id::text,state,version FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,input.requisitionId])).rows[0];
   if(!req||req.state!=="draft"||Number(req.version)!==input.version)invoiceConflict("Requisition changed; reload before assigning a buyer.");
   const buyer=(await tx.query("SELECT id::text FROM operations.shopping_buyers($1) WHERE id=$2 LIMIT 1",[tx.companyId,input.buyerId])).rows[0];
   if(!buyer)throw new ApiError(400,"INVALID_REQUEST","Buyer must be a verified, active company member with purchasing permission.");
   const count=(await tx.query("SELECT count(*)::int AS n FROM operations.shopping_requisition_lines l JOIN operations.shopping_supplier_groups g ON g.company_id=l.company_id AND g.id=l.supplier_group_id WHERE l.company_id=$1 AND g.requisition_id=$2 AND l.state='pending'",[tx.companyId,input.requisitionId])).rows[0].n;
   if(!count)throw new ApiError(400,"INVALID_REQUEST","Add at least one product before assigning this requisition.");
   const updated=(await tx.query("UPDATE operations.shopping_requisitions SET assigned_buyer_id=$3,state='accepted',required_on=$4::date,priority=$5,instructions=$6,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id::text,state,version",[tx.companyId,input.requisitionId,input.buyerId,input.requiredOn,input.priority,input.instructions])).rows[0];
   const groups=(await tx.query("SELECT id::text,supplier_id::text FROM operations.shopping_supplier_groups WHERE company_id=$1 AND requisition_id=$2 ORDER BY supplier_id,id FOR UPDATE",[tx.companyId,input.requisitionId])).rows;
   for(const group of groups){
    const existing=(await tx.query("SELECT purchase_request_id::text FROM operations.shopping_supplier_groups WHERE company_id=$1 AND id=$2",[tx.companyId,group.id])).rows[0];
    if(existing?.purchase_request_id)throw new ApiError(409,"CONFLICT","Supplier group already has a purchase request; inspect before retrying.");
    const requestId=randomUUID(),notes=`Shopping requisition ${input.requisitionId}${input.instructions?` · ${input.instructions}`:""}`.slice(0,2000);
    await tx.query("INSERT INTO operations.purchase_requests(id,company_id,supplier_id,requested_on,notes,created_by) VALUES($1,$2,$3,coalesce($4::date,current_date),$5,$6)",[requestId,tx.companyId,group.supplier_id,input.requiredOn,notes,tx.actorId]);
    const lineResult=await tx.query("INSERT INTO operations.purchase_request_lines(company_id,request_id,position,material_id,quantity) SELECT $1,$2,row_number() OVER(ORDER BY material_id)::int,material_id,sum(requested_quantity*requested_base_quantity_per_unit) FROM operations.shopping_requisition_lines WHERE company_id=$1 AND supplier_group_id=$3 AND state='pending' GROUP BY material_id ORDER BY material_id",[tx.companyId,requestId,group.id]);
    if(!lineResult.rowCount)throw new ApiError(400,"INVALID_REQUEST","Every supplier group must contain an active cart line.");
    await tx.query("UPDATE operations.shopping_supplier_groups SET purchase_request_id=$3,state='accepted',version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,group.id,requestId]);
   }
   await addEvent(tx,input.requisitionId,"requisition.assigned",{buyerId:input.buyerId});return updated;
  }));
 },
 async inbox(scope:CompanyScope){return scoped(database,scope,"procurement:read",tx=>(async()=>{
  return (await tx.query("SELECT r.id::text,r.requested_by::text,r.assigned_buyer_id::text,r.state,r.required_on::text,r.priority,r.instructions,r.version,r.created_at::text,COALESCE((SELECT count(*)::int FROM operations.shopping_supplier_groups g JOIN operations.shopping_requisition_lines l ON l.company_id=g.company_id AND l.supplier_group_id=g.id WHERE g.company_id=r.company_id AND g.requisition_id=r.id AND l.state<>'removed'),0) AS line_count FROM operations.shopping_requisitions r WHERE r.company_id=$1 AND r.assigned_buyer_id=$2 AND r.state IN('accepted','purchasing','partially_purchased','purchased','delivered','cancelled') ORDER BY r.created_at DESC LIMIT 100",[tx.companyId,tx.actorId])).rows;
 })());},
 async transition(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["requisitionId","state","version"]),id=uuid(b.requisitionId).toLowerCase(),next=text(b.state,30,"requisition state")!,expected=version(b.version);
  if(!["purchasing","cancelled"].includes(next))throw new ApiError(400,"INVALID_REQUEST","This transition is not available here; delivery is recorded through goods receipt.");
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.requisition.transition",key,{id,next,expected},async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[id]);
   const row=(await tx.query("SELECT id::text,state,version,assigned_buyer_id::text FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,id])).rows[0];
   if(!row||Number(row.version)!==expected||row.assigned_buyer_id!==tx.actorId)invoiceConflict("Assigned buyer access or current version is required.");
   const allowed:Record<string,string[]>={accepted:["purchasing","cancelled"],purchasing:["cancelled"],partially_purchased:["purchasing","cancelled"],purchased:[]};
   if(!allowed[String(row.state)]?.includes(next))invoiceConflict("This requisition transition is not allowed.");
   if(next==="purchasing"){
    const orders=(await tx.query("SELECT count(*)::int AS total,count(purchase_order_id)::int AS linked FROM operations.shopping_supplier_groups WHERE company_id=$1 AND requisition_id=$2",[tx.companyId,id])).rows[0];
    if(Number(orders.total)===0||Number(orders.total)!==Number(orders.linked))throw new ApiError(409,"CONFLICT","Every supplier group needs its authorized purchase order before purchasing starts.");
   }
   let cancellation:unknown=null;if(next==="cancelled"){cancellation=(await tx.query("SELECT operations.cancel_shopping_requisition($1,$2,$3) AS result",[tx.companyId,id,tx.actorId])).rows[0]?.result;if(!cancellation)invoiceConflict("The requisition could not be cancelled.");}
   const changed=(await tx.query("UPDATE operations.shopping_requisitions SET state=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id::text,state,version",[tx.companyId,id,next])).rows[0];
   if(next!=="cancelled")await tx.query("UPDATE operations.shopping_supplier_groups SET state=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND requisition_id=$2",[tx.companyId,id,next]);
   await addEvent(tx,id,`requisition.${next}`,cancellation?{cancellation}:{});return changed;
  }));
 },
 async reconcileLine(scope:CompanyScope,value:unknown,key:string){
  const b=eventInput(value,["requisitionId","lineId","state","actualMaterialId","actualQuantity","actualUnit","unitPrice","currency","substitutionNote","buyerNote","version"]),id=uuid(b.requisitionId).toLowerCase(),lineId=uuid(b.lineId).toLowerCase(),state=text(b.state,20,"line state")!,expected=version(b.version);
  if(!["purchased","unavailable"].includes(state))throw new ApiError(400,"INVALID_REQUEST","Choose purchased or unavailable.");
  const actualMaterialId=state==="purchased"?uuid(b.actualMaterialId).toLowerCase():null,actualQuantity=state==="purchased"?quantity(b.actualQuantity):null,actualUnit=state==="purchased"?unit(b.actualUnit):null,price=state==="purchased"?unitPrice(b.unitPrice):null,currency=price===null?null:text(b.currency,3,"currency");
  if(currency&&!['GBP','EUR','USD'].includes(currency))throw new ApiError(400,"INVALID_REQUEST","Currency must be GBP, EUR, or USD.");
  const substitution=text(b.substitutionNote,500,"substitution note",true),buyerNote=text(b.buyerNote,1000,"buyer note",true);
  return scoped(database,scope,"procurement:write",tx=>businessCommand(tx,"ors.shopping.line.reconcile",key,{id,lineId,state,actualMaterialId,actualQuantity,actualUnit,price,currency,substitution,buyerNote,expected},async()=>{
   await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,832))",[id]);
   const req=(await tx.query("SELECT state,version,assigned_buyer_id::text FROM operations.shopping_requisitions WHERE company_id=$1 AND id=$2 FOR UPDATE",[tx.companyId,id])).rows[0];
   if(!req||Number(req.version)!==expected||req.assigned_buyer_id!==tx.actorId||!['purchasing','partially_purchased'].includes(String(req.state)))invoiceConflict("Assigned buyer and current purchasing version are required.");
   const existing=(await tx.query("SELECT l.material_id::text,g.id::text AS group_id,g.supplier_id::text FROM operations.shopping_requisition_lines l JOIN operations.shopping_supplier_groups g ON g.company_id=l.company_id AND g.id=l.supplier_group_id WHERE l.company_id=$1 AND g.requisition_id=$2 AND l.id=$3 AND l.state='pending'",[tx.companyId,id,lineId])).rows[0];
   if(!existing)invoiceConflict("This line is already reconciled or is outside the requisition.");
   let baseUnit:null|string=null,basePerUnit:null|string=null;
   if(state==='purchased'){
    if(actualMaterialId!==String(existing.material_id)&&(!substitution||substitution.length<3))throw new ApiError(400,"INVALID_REQUEST","Explain any product substitution.");
    const conversion=(await tx.query("SELECT base_unit,base_quantity_per_unit::text FROM operations.shopping_units WHERE company_id=$1 AND material_id=$2 AND unit_code=$3",[tx.companyId,actualMaterialId,actualUnit])).rows[0];
    if(!conversion)throw new ApiError(400,"INVALID_REQUEST","Purchased product and unit need a company-confirmed conversion.");baseUnit=String(conversion.base_unit);basePerUnit=String(conversion.base_quantity_per_unit);
   }
   const updated=(await tx.query("UPDATE operations.shopping_requisition_lines SET state=$4,actual_material_id=$5,actual_quantity=$6,actual_unit=$7,actual_base_unit=$8,actual_base_quantity_per_unit=$9,actual_unit_price=$10,actual_currency=$11,substitution_note=$12,buyer_note=$13,updated_by=$14,updated_at=now() WHERE company_id=$1 AND id=$2 AND supplier_group_id=$3 RETURNING id::text,state",[tx.companyId,lineId,existing.group_id,state,actualMaterialId,actualQuantity,actualUnit,baseUnit,basePerUnit,price,currency,substitution,buyerNote,tx.actorId])).rows[0];
   const reconciliation=(await tx.query("SELECT operations.apply_shopping_purchase_reconciliation($1,$2,$3,$4) AS result",[tx.companyId,id,existing.group_id,tx.actorId])).rows[0]?.result;
   if(reconciliation){await tx.query("INSERT INTO operations.shopping_events(company_id,requisition_id,actor_id,action,details) VALUES($1,$2,$3,'purchase_order.actuals_applied',$4::jsonb)",[tx.companyId,id,tx.actorId,JSON.stringify(reconciliation)]);await businessAudit(tx,"ors.shopping.purchase_order.actuals_applied",id);}
   const groupState=(await tx.query("SELECT bool_or(state='pending') AS pending,bool_or(state='unavailable') AS unavailable,count(*) FILTER(WHERE state='purchased')::int AS purchased FROM operations.shopping_requisition_lines WHERE company_id=$1 AND supplier_group_id=$2",[tx.companyId,existing.group_id])).rows[0];
   const nextGroup=groupState.pending?'purchasing':groupState.unavailable&&Number(groupState.purchased)>0?'partially_purchased':groupState.unavailable?'partially_purchased':'purchased';
   await tx.query("UPDATE operations.shopping_supplier_groups SET state=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2",[tx.companyId,existing.group_id,nextGroup]);
   const all=(await tx.query("SELECT bool_or(l.state='pending') AS pending,bool_or(l.state='unavailable') AS unavailable,count(*) FILTER(WHERE l.state='purchased')::int AS purchased FROM operations.shopping_supplier_groups g JOIN operations.shopping_requisition_lines l ON l.company_id=g.company_id AND l.supplier_group_id=g.id WHERE g.company_id=$1 AND g.requisition_id=$2 AND l.state<>'removed'",[tx.companyId,id])).rows[0];
   const next=all.pending?'purchasing':all.unavailable&&Number(all.purchased)>0?'partially_purchased':all.unavailable?'partially_purchased':'purchased';
   const reqChanged=(await tx.query("UPDATE operations.shopping_requisitions SET state=$3,version=version+1,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING id::text,state,version",[tx.companyId,id,next])).rows[0];
   await addEvent(tx,id,`line.${state}`,{lineId,supplierId:existing.supplier_id,unitPrice:price,currency,substitution:substitution!==null});
   return {line:updated,requisition:reqChanged};
  }));
 }
};}

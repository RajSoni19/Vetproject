// Synthetic business records on the approved local database; never migrates.
const s=require('./saas-services.cjs');
const {assert,loadSource}=s;
process.env.SAAS_ORS_SHOPPING_ENABLED='1';
async function main(){
 const {database,pool}=s.business(),shopping=loadSource('lib/server/ors/shopping').shoppingService(database),ops=loadSource('lib/server/ors/services').operationsService(database),invoices=loadSource('lib/server/saas/invoices').invoiceService(database);
 const key=()=>s.crypto.randomUUID(),checks=[];
 const check=async(name,fn)=>{await fn();checks.push(name);console.log('REAL PASS '+name);};
 try{
  const user=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('grocery-flow')),company=await s.companyFor(user.userId),scope=permission=>({sessionCookie:user.token,companyId:company,permission});
  await s.operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Starter','active',100,2,4,180,true,now(),'synthetic-grocery-acceptance-not-payment' FROM saas.company_profiles WHERE company_id=$1",[company]));
  const supplier=await invoices.saveContact(scope('contacts:write'),{kind:'supplier',name:'Synthetic grocery supplier',status:'active'},key());
  const material=await ops.createMaterial(scope('procurement:write'),{sku:'TEST-EGGS',name:'Synthetic eggs',unit:'EA',reorderPoint:'1'},key());
  const warehouse=await ops.createWarehouse(scope('inventory:adjust'),{code:'GROCERY',name:'Synthetic grocery warehouse'},key()),location=await ops.createLocation(scope('inventory:adjust'),{warehouseId:warehouse.id,code:'MAIN',name:'Main'},key());
  await check('newly created material appears in manager setup and is unlisted for shoppers',async()=>{
   assert.ok((await shopping.catalogue(scope('procurement:approve'),true)).some(p=>p.id===material.id&&!p.listed));
   assert.equal((await shopping.catalogue(scope('procurement:read'))).length,0);
   await assert.rejects(shopping.catalogue(scope('procurement:read'),true),{status:403});
  });
  await check('reviewed category, supplier and box conversion persist without invented defaults',async()=>{
   await shopping.configureListing(scope('procurement:approve'),{materialId:material.id,listed:true,category:'Dairy and eggs',imagePath:null,version:1},key());
   await shopping.configureSupplier(scope('procurement:approve'),{materialId:material.id,supplierId:supplier.id,productName:'Six eggs',supplierSku:'EGG-6'},key());
   await shopping.configureUnit(scope('procurement:approve'),{materialId:material.id,unit:'box',baseUnit:'EA',baseQuantityPerUnit:'6'},key());
   const product=(await shopping.catalogue(scope('procurement:read')))[0];assert.equal(product.category,'Dairy and eggs');assert.equal(product.units[0].baseQuantityPerUnit,'6.000000');assert.equal(product.suppliers[0].id,supplier.id);
  });
  let cart,req,order;
  await check('durable cart preserves explicit units, edits and idempotency',async()=>{
   const command={materialId:material.id,supplierId:supplier.id,quantity:'2',unit:'box',note:'Keep cool'},idempotency=key();
   cart=await shopping.addLine(scope('procurement:write'),command,idempotency,1);assert.equal((await shopping.addLine(scope('procurement:write'),command,idempotency,1)).id,cart.id);
   assert.equal((await shopping.cart(scope('procurement:read'))).groups[0].lines[0].quantity,'2.0000');
   await assert.rejects(shopping.updateLine(scope('procurement:write'),{requisitionId:cart.id,lineId:cart.groups[0].lines[0].id,quantity:'3',unit:'box',note:null},key(),1),{status:409});
  });
  await check('assignment produces one linked request with exact base quantity and authorized buyer',async()=>{
   const buyers=await shopping.buyers(scope('procurement:read'));assert.equal(buyers.canAssign,true);assert.ok(buyers.items.some(b=>b.id===user.userId));
   await shopping.assign(scope('procurement:write'),{requisitionId:cart.id,buyerId:user.userId,version:Number(cart.version),priority:'normal',requiredOn:'2026-10-30',instructions:'Synthetic acceptance'},key());
   req=await shopping.requisition(scope('procurement:read'),cart.id);
   const request=(await ops.purchaseRequests(scope('procurement:read'))).find(r=>r.id===req.groups[0].purchase_request_id);assert.equal(request.lines[0].quantity,'12.0000');
   await ops.approvePurchaseRequest(scope('procurement:approve'),request.id,key(),request.version);
   order=await ops.createPurchaseOrder(scope('procurement:approve'),request.id,{orderedOn:'2026-10-30'},key());
   req=await shopping.requisition(scope('procurement:read'),cart.id);assert.equal(req.state,'purchasing');assert.equal(req.groups[0].purchase_order_id,order.id);
  });
  await check('actual purchase changes the open order once and never posts stock',async()=>{
   await shopping.reconcileLine(scope('procurement:write'),{requisitionId:req.id,lineId:req.groups[0].lines[0].id,state:'purchased',actualMaterialId:material.id,actualQuantity:'1',actualUnit:'box',unitPrice:'2.50',currency:'GBP',version:Number(req.version)},key());
   const po=(await ops.purchaseOrders(scope('procurement:read'))).find(p=>p.id===order.id);assert.equal(po.lines[0].quantity,'6.0000');
   assert.equal((await ops.inventory(scope('inventory:read'))).movements.length,0);
  });
  await check('partial then final goods receipt posts exact stock once and completes buyer history',async()=>{
   const command={purchaseOrderId:order.id,locationId:location.id,receivedOn:'2026-10-30',reference:'GROCERY-PART-1',lines:[{materialId:material.id,quantity:'2'}]},idempotency=key();
   const receipt=await ops.receiveGoods(scope('inventory:receive'),command,idempotency);assert.equal((await ops.receiveGoods(scope('inventory:receive'),command,idempotency)).id,receipt.id);
   await assert.rejects(ops.receiveGoods(scope('inventory:receive'),{...command,reference:'OVER',lines:[{materialId:material.id,quantity:'5'}]},key()));
   await ops.receiveGoods(scope('inventory:receive'),{...command,reference:'GROCERY-PART-2',lines:[{materialId:material.id,quantity:'4'}]},key());
   const inventory=await ops.inventory(scope('inventory:read'));assert.equal(inventory.balances[0].on_hand,'6.0000');assert.equal(inventory.movements.length,2);
   const history=(await shopping.inbox(scope('procurement:read'))).find(r=>r.id===cart.id);assert.equal(history.state,'delivered');
  });
  await check('tenant isolation and temporary migration privilege revocation remain enforced',async()=>{
   const other=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('grocery-foreign')),foreign=await s.companyFor(other.userId);
   await assert.rejects(shopping.requisition({...scope('procurement:read'),sessionCookie:other.token,companyId:foreign},cart.id));
   await s.operator(async db=>{assert.equal((await db.query("SELECT has_column_privilege('vtv_saas_owner','web_auth.company_memberships','user_id','REFERENCES') AS allowed")).rows[0].allowed,false);const rows=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='operations'::regnamespace AND relname LIKE 'shopping_%' AND relkind='r'")).rows;assert.equal(rows.length,11);assert.ok(rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));});
  });
  console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

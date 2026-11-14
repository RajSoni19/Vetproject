const s=require('./saas-services.cjs');
const {assert,loadSource}=s;
const marketplace=loadSource('lib/ors-marketplace');
process.env.SAAS_ORS_SHOPPING_ENABLED='1';

async function main(){
 const {database,pool}=s.business(),shopping=loadSource('lib/server/ors/shopping').shoppingService(database),ops=loadSource('lib/server/ors/services').operationsService(database),invoices=loadSource('lib/server/saas/invoices').invoiceService(database);
 const key=()=>s.crypto.randomUUID(),checks=[],check=async(name,fn)=>{await fn();checks.push(name);console.log('REAL PASS '+name);};
 const baseCounts=await s.operator(async db=>(await db.query(`SELECT
  (SELECT count(*)::int FROM operations.shopping_requisitions) requisitions,
  (SELECT count(*)::int FROM operations.shopping_supplier_groups) supplier_groups,
  (SELECT count(*)::int FROM operations.shopping_requisition_lines) requisition_lines`)).rows[0]);
 let dispatchIds=[],company,material,suppliers=[],unauthorized;
 try{
  const identity=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('ors-marketplace-acceptance'));
  company=await s.companyFor(identity.userId);
  const scope=permission=>({sessionCookie:identity.token,companyId:company,permission});
  await s.operator(db=>db.query(`INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference)
   SELECT account_id,'Starter','active',100,2,4,180,true,now(),'synthetic-ors-marketplace-acceptance-not-payment'
   FROM saas.company_profiles WHERE company_id=$1`,[company]));
  await check('exact three command-key allowlist accepts marketplace mutations',async()=>{
   const state=await s.operator(async db=>(await db.query(`SELECT
    (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='business.command_keys'::regclass AND conname='command_keys_operation_check') definition`)).rows[0]);
   assert.ok(state.definition.includes('ors.shopping.offer.configure'));
   assert.ok(state.definition.includes('ors.shopping.whatsapp.configure'));
   assert.ok(state.definition.includes('ors.shopping.checkout'));
   assert.ok(state.definition.includes('ors.shopping.cart.add'));
  });
  suppliers.push(await invoices.saveContact(scope('contacts:write'),{kind:'supplier',name:'Synthetic Orchard',status:'active'},key()));
  suppliers.push(await invoices.saveContact(scope('contacts:write'),{kind:'supplier',name:'Synthetic Market',status:'active'},key()));
  const suffix=s.crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
  material=await ops.createMaterial(scope('procurement:write'),{sku:'DEMO-'+suffix,name:'Synthetic demo rice '+suffix,unit:'EA',reorderPoint:'1'},key());
  await check('supplier mappings and explicit pack setup persist',async()=>{
   await shopping.configureListing(scope('procurement:approve'),{materialId:material.id,listed:true,category:'Synthetic demo',imagePath:null,version:1},key());
   await shopping.configureUnit(scope('procurement:approve'),{materialId:material.id,unit:'box',baseUnit:'EA',baseQuantityPerUnit:'6'},key());
   for(let i=0;i<suppliers.length;i++)await shopping.configureSupplier(scope('procurement:approve'),{materialId:material.id,supplierId:suppliers[i].id,productName:'Demo rice '+(i+1),supplierSku:'RICE-'+suffix+'-'+(i+1)},key());
   const product=(await shopping.catalogue(scope('procurement:read'))).find(p=>p.id===material.id);
   assert.equal(product.listed,true);assert.equal(product.suppliers.length,2);
   assert.equal(product.units.find(u=>u.code==='box').baseQuantityPerUnit,'6.000000');
  });
  await check('real supplier offer commands persist and comparable offers rank by net unit price',async()=>{
   const expiry=new Date(Date.now()+30*86400000).toISOString();
   const offerA=await shopping.configureOffer(scope('procurement:approve'),{materialId:material.id,supplierId:suppliers[0].id,unit:'box',unitPrice:'12',currency:'GBP',vatRate:'20',includesVat:true,minimumQuantity:'1',availableQuantity:'100',validUntil:expiry,sourceReference:'Synthetic demo quote A'},key());
   const offerB=await shopping.configureOffer(scope('procurement:approve'),{materialId:material.id,supplierId:suppliers[1].id,unit:'box',unitPrice:'11',currency:'GBP',vatRate:'20',includesVat:false,minimumQuantity:'1',availableQuantity:'100',validUntil:expiry,sourceReference:'Synthetic demo quote B'},key());
   assert.ok(offerA.id&&offerB.id);
   const visible=(await shopping.offers(scope('procurement:read'))).items.filter(o=>o.material_id===material.id);
   assert.equal(visible.length,2);
   assert.ok(marketplace.compareOffers(visible.find(o=>o.supplier_id===suppliers[0].id),visible.find(o=>o.supplier_id===suppliers[1].id))<0);
  });
  await check('supplier WhatsApp contacts are validated and persisted without sending',async()=>{
   const phones=['+447700900111','+447700900222'];
   for(let i=0;i<suppliers.length;i++)await shopping.configureWhatsapp(scope('procurement:approve'),{supplierId:suppliers[i].id,phone:phones[i],method:'supplier_call',sourceReference:'Synthetic verified test number'},key());
   await assert.rejects(shopping.configureWhatsapp(scope('procurement:approve'),{supplierId:suppliers[0].id,phone:'02012345678',method:'supplier_call',sourceReference:'Invalid synthetic number'},key()),e=>e.status===400);
   const contacts=await s.operator(async db=>(await db.query(`SELECT supplier_id::text,phone_e164 FROM operations.shopping_supplier_whatsapp WHERE company_id=$1 AND revoked_at IS NULL`,[company])).rows);
   assert.equal(contacts.length,2);assert.deepEqual(contacts.map(c=>c.phone_e164).sort(),phones.slice().sort());
  });
  let cart,quote,checkout;
  await check('cart supports quantity edits, multiple suppliers and refresh persistence',async()=>{
   cart=await shopping.addLine(scope('procurement:write'),{materialId:material.id,supplierId:suppliers[0].id,quantity:'2',unit:'box',note:'Synthetic order A'},key(),1);
   cart=await shopping.updateLine(scope('procurement:write'),{requisitionId:cart.id,lineId:cart.groups[0].lines[0].id,quantity:'3',unit:'box',note:'Updated synthetic quantity'},key(),Number(cart.version));
   cart=await shopping.addLine(scope('procurement:write'),{materialId:material.id,supplierId:suppliers[1].id,quantity:'2',unit:'box',note:'Synthetic order B'},key(),Number(cart.version));
   const refreshed=await shopping.cart(scope('procurement:read'));
   assert.equal(refreshed.id,cart.id);assert.equal(refreshed.groups.length,2);
   assert.deepEqual(refreshed.groups.map(g=>g.supplier_id).sort(),suppliers.map(s=>s.id).sort());
   assert.ok(refreshed.groups.some(g=>g.lines.some(l=>l.quantity==='3.0000')));
   assert.ok(refreshed.groups.some(g=>g.lines.some(l=>l.quantity==='2.0000')));
   cart=refreshed;
  });
  await check('checkout creates persistent supplier-specific pending drafts with accurate VAT totals',async()=>{
   quote=await shopping.quote(scope('procurement:read'),cart.id);
   assert.equal(quote.groups.length,2);assert.ok(quote.groups.every(g=>g.issues.length===0));
   checkout=await shopping.checkout(scope('procurement:write'),{requisitionId:cart.id,fingerprint:quote.fingerprint},key(),quote.version);
   assert.equal(checkout.orders.length,2);
   assert.ok(checkout.orders.every(o=>o.state==='pending_dispatch'));
   assert.deepEqual(checkout.orders.map(o=>o.supplierName).sort(),['Synthetic Market','Synthetic Orchard']);
   assert.ok(checkout.orders.every(o=>o.url.startsWith('https://wa.me/')));
   assert.ok(checkout.orders.every(o=>o.message.includes(o.supplierName)&&/VAT 20(?:\.00)?%/.test(o.message)));
   assert.equal(checkout.orders.some(o=>o.state!=='pending_dispatch'),false);
   dispatchIds=checkout.orders.map(o=>o.id);
   const stored=await shopping.shoppingOrders(scope('procurement:read'));
   assert.equal(stored.items.filter(o=>dispatchIds.includes(o.id)).length,2);
   for(const order of checkout.orders){
    const detail=await shopping.shoppingOrders(scope('procurement:read'),order.id);
    assert.equal(detail.items[0].state,'pending_dispatch');
    assert.equal(detail.actions[0].url,order.url);
    assert.ok(detail.actions[0].message.includes(order.supplierName));
    assert.equal(Number(detail.items[0].total_amount),Number(detail.items[0].subtotal)+Number(detail.items[0].vat_amount));
   }
   const commandRows=await s.operator(async db=>(await db.query(`SELECT operation,count(*)::int n FROM business.command_keys WHERE company_id=$1 AND operation IN ('ors.shopping.offer.configure','ors.shopping.whatsapp.configure','ors.shopping.checkout') GROUP BY operation ORDER BY operation`,[company])).rows);
   assert.deepEqual(commandRows.map(r=>[r.operation,r.n]),[['ors.shopping.checkout',1],['ors.shopping.offer.configure',2],['ors.shopping.whatsapp.configure',2]]);
  });
  await check('unauthorized and cross-company access are denied; WhatsApp remains unsent',async()=>{
   unauthorized=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('ors-marketplace-no-approve'));
   await s.operator(db=>db.query(`INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES($1,$2,'Procurement','active')`,[unauthorized.userId,company]));
   const deniedScope={sessionCookie:unauthorized.token,companyId:company,permission:'procurement:approve'};
   await assert.rejects(shopping.configureOffer(deniedScope,{materialId:material.id,supplierId:suppliers[0].id,unit:'box',unitPrice:'1',currency:'GBP',vatRate:'0',includesVat:false,minimumQuantity:'1',availableQuantity:'1',validUntil:new Date(Date.now()+86400000).toISOString(),sourceReference:'Unauthorized attempt'},key()),e=>e.status===403);
   await assert.rejects(shopping.configureWhatsapp(deniedScope,{supplierId:suppliers[0].id,phone:'+447700900333',method:'supplier_call',sourceReference:'Unauthorized attempt'},key()),e=>e.status===403);
   const foreignIdentity=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('ors-marketplace-foreign-company'));
   const foreignCompany=await s.companyFor(foreignIdentity.userId);
   await s.operator(db=>db.query(`INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference)
    SELECT account_id,'Starter','active',100,2,4,180,true,now(),'synthetic-foreign-marketplace-test-not-payment' FROM saas.company_profiles WHERE company_id=$1`,[foreignCompany]));
   await assert.rejects(shopping.shoppingOrders({sessionCookie:foreignIdentity.token,companyId:foreignCompany,permission:'procurement:read'},dispatchIds[0]),e=>e.status===404);
   const final=await s.operator(async db=>(await db.query(`SELECT (SELECT count(*)::int FROM operations.shopping_dispatches WHERE company_id=$1 AND id=ANY($2::uuid[])) drafts,(SELECT count(*)::int FROM operations.shopping_dispatches WHERE company_id=$1 AND id=ANY($2::uuid[]) AND state='pending_dispatch') pending,(SELECT count(*)::int FROM operations.shopping_requisitions) requisitions,(SELECT count(*)::int FROM operations.shopping_supplier_groups) supplier_groups,(SELECT count(*)::int FROM operations.shopping_requisition_lines) requisition_lines`,[company,dispatchIds])).rows[0]);
   assert.equal(final.drafts,2);assert.equal(final.pending,2);
   assert.equal(final.requisitions,baseCounts.requisitions+1);assert.equal(final.supplier_groups,baseCounts.supplier_groups+2);assert.equal(final.requisition_lines,baseCounts.requisition_lines+2);
   const sent=(await s.operator(async db=>(await db.query(`SELECT count(*)::int n FROM operations.shopping_dispatches WHERE company_id=$1 AND id=ANY($2::uuid[]) AND state IN('awaiting_confirmation','delivered','accepted')`,[company,dispatchIds])).rows[0])).n;
   assert.equal(sent,0);
  });
  const evidence={passed:checks.length,checks,target:'127.0.0.1:55440/vtv_saas_dev',migration:'040_ors_marketplace_command_keys.review.sql',migrationSha256:'8745e6bcc5972ba27f302e5613cfccb48152dfcde33a68673d7be50f9be534be',syntheticCompanyId:company,syntheticMaterialId:material.id,syntheticSupplierIds:suppliers.map(x=>x.id),dispatchIds,orders:checkout.orders.map(o=>({id:o.id,supplierName:o.supplierName,state:o.state,url:o.url,message:o.message})),vatTotals:quote.groups.map(g=>({supplierName:g.supplierName,subtotal:g.subtotal,vat:g.vat,total:g.total})),whatsappMessagesSent:false};
  s.fs.mkdirSync('.launch-acceptance',{recursive:true});s.fs.writeFileSync('.launch-acceptance/marketplace-postgres.json',JSON.stringify(evidence,null,2));
  console.log('REAL ACCEPTANCE PASS '+JSON.stringify({passed:checks.length,dispatches:dispatchIds.length,whatsappMessagesSent:false,evidence:'.launch-acceptance/marketplace-postgres.json'}));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

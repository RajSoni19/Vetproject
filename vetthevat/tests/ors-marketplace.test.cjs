const test=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const m=loadSource('lib/ors-marketplace'),{marketplaceService}=loadSource('lib/server/ors/marketplace');
const offer={id:'123e4567-e89b-42d3-a456-426614174001',material_id:'123e4567-e89b-42d3-a456-426614174002',supplier_id:'123e4567-e89b-42d3-a456-426614174003',unit_code:'box',base_unit:'kg',base_quantity_per_unit:'5',unit_price:'12',currency:'GBP',vat_rate:'20',price_includes_vat:true,minimum_order_quantity:'1',available_quantity:'20',availability_state:'available',valid_until:'2099-01-01T00:00:00.000Z',version:1};
test('VAT-inclusive and exclusive amounts, fractional quantities and rounding are exact',()=>{
 assert.deepEqual(m.lineAmounts(offer,'2'),{subtotal:'20.00',vat:'4.00',total:'24.00'});
 assert.equal(m.currencyAmount('12.000000'),'12.00');assert.equal(m.currencyAmount('0.005000'),'0.01');
 assert.deepEqual(m.lineAmounts({...offer,unit_price:'10',price_includes_vat:false},'2'),{subtotal:'20.00',vat:'4.00',total:'24.00'});
 assert.deepEqual(m.lineAmounts({...offer,unit_price:'0.10',price_includes_vat:false},'0.5'),{subtotal:'0.05',vat:'0.01',total:'0.06'});
 assert.deepEqual(m.lineAmounts({...offer,unit_price:'0',vat_rate:'0'},'1'),{subtotal:'0.00',vat:'0.00',total:'0.00'});
 assert.deepEqual(m.sumAmounts([m.lineAmounts(offer,'2'),m.lineAmounts(offer,'1')]),{subtotal:'30.00',vat:'6.00',total:'36.00'});
});
test('equivalent packs compare on net price and not misleading pack sticker prices',()=>{
 const small={...offer,base_quantity_per_unit:'1',unit_price:'3',price_includes_vat:false};
 assert.equal(m.compareOffers(offer,small),-1); // 2/kg versus 3/kg
 assert.equal(m.compareOffers(offer,{...offer,unit_price:'10',price_includes_vat:false}),0);
 for(const change of [{valid_until:'2000-01-01'},{availability_state:'unknown'},{available_quantity:'0'},{minimum_order_quantity:'2'},{currency:'JPY'}])assert.equal(m.offerUsable({...offer,...change},'1'),false);
 assert.equal(m.offerUsable(offer,'21'),false);assert.equal(m.offerUsable(offer,'1'),true);
});
test('WhatsApp validates international phones and formats supplier-specific VAT messages',()=>{
 for(const phone of ['', '02012345678','+0123456789','+44 12345678','+44123','https://wa.me/1'])assert.throws(()=>m.phoneDigits(phone));
 assert.equal(m.phoneDigits('+441234567890'),'441234567890');
 const message=m.whatsappMessage('Synthetic Company','Synthetic Supplier','ORS-ABC12345','GBP',[{name:'Rice',sku:'R1',quantity:'2',unit:'box',unitPrice:'12',vatRate:'20',includesVat:true,total:'24.00'}],{subtotal:'20.00',vat:'4.00',total:'24.00'});
 for(const part of ['ORS-ABC12345','Synthetic Company','Synthetic Supplier','2 box','GBP 12','VAT 20%','GBP 20.00','GBP 4.00','GBP 24.00','pending confirmation'])assert.ok(message.includes(part));
 assert.equal(new URL('https://wa.me/441234567890?text='+encodeURIComponent(message)).searchParams.get('text'),message);
});
function fixture(){
 const company='123e4567-e89b-42d3-a456-426614174010',actor='123e4567-e89b-42d3-a456-426614174011',req='123e4567-e89b-42d3-a456-426614174012',group='123e4567-e89b-42d3-a456-426614174013';
 const calls=[],state={offer:{...offer},phone:'+441234567890',version:2,closed:false};
 const database={async scoped(scope,work){if(scope.companyId!==company)throw Object.assign(Error('Company permission required'),{status:403});const tx={companyId:company,actorId:actor,permission:scope.permission,sessionId:'fixture',async query(sql,params=[]){calls.push({sql,params});let rows=[];
  if(sql.startsWith('SELECT to_regclass'))rows=[{ready:true}];
  else if(sql.includes('FROM operations.shopping_requisitions WHERE'))rows=[{id:req,version:state.version,requested_by:actor,state:state.closed?'accepted':'draft'}];
  else if(sql.includes('SELECT l.id::text'))rows=[{id:'line',material_id:offer.material_id,quantity:'2',unit:'box',base_unit:'kg',factor:'5',group_id:group,supplier_id:offer.supplier_id,supplier_name:'Synthetic Supplier',name:'Rice',sku:'R1'}];
  else if(sql.startsWith('SELECT o.*'))rows=[state.offer];
  else if(sql.includes('SELECT supplier_id::text,phone_e164'))rows=[{supplier_id:offer.supplier_id,phone_e164:state.phone}];
  else if(sql.includes('SELECT payload_hash,response'))rows=[{payload_hash:calls.find(c=>c.sql.startsWith('INSERT INTO business.command_keys')).params[5],response:null}];
  else if(sql.startsWith('SELECT name FROM saas.company_context'))rows=[{name:'Synthetic Company'}];
  else if(sql.startsWith('UPDATE operations.shopping_requisitions'))state.closed=true;
  return {rows,rowCount:1};}};return work(tx);}};
 return {service:marketplaceService(database),state,calls,company,req,read:{companyId:company,permission:'procurement:read'},write:{companyId:company,permission:'procurement:write'}};
}
test('actual checkout service snapshots offers and amounts and leaves dispatch pending',async()=>{
 const f=fixture(),q=await f.service.quote(f.read,f.req),saved=await f.service.checkout(f.write,{requisitionId:f.req,fingerprint:q.fingerprint},'123e4567-e89b-42d3-a456-426614174020',2);
 assert.equal(saved.orders.length,1);assert.equal(saved.orders[0].state,'pending_dispatch');assert.match(saved.orders[0].reference,/^ORS-[A-Z0-9]{20}$/);
 assert.equal(new URL(saved.orders[0].url).pathname,'/441234567890');assert.ok(saved.orders[0].message.includes('GBP 24.00'));
 assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT INTO operations.shopping_dispatches')).length,1);
 assert.equal(f.calls.filter(c=>c.sql.startsWith('INSERT INTO operations.shopping_dispatch_lines')).length,1);
 assert.equal(f.state.closed,true);assert.equal(f.calls.some(c=>/UPDATE operations.shopping_dispatches/.test(c.sql)),false);
 for(const c of f.calls.filter(c=>/operations\./.test(c.sql)&&c.params.length&& !c.sql.includes('pg_advisory')))assert.equal(c.params[0]===f.company||c.sql.startsWith('INSERT INTO operations.shopping_dispatches')&&c.params[1]===f.company,true,c.sql);
});
test('checkout rejects price changes, invalid phone, overselling, wrong permissions and foreign company',async()=>{
 for(const change of [{unit_price:'13'},{available_quantity:'1'},{base_quantity_per_unit:'6'}]){const f=fixture(),q=await f.service.quote(f.read,f.req);Object.assign(f.state.offer,change);await assert.rejects(()=>f.service.checkout(f.write,{requisitionId:f.req,fingerprint:q.fingerprint},'123e4567-e89b-42d3-a456-426614174021',2),e=>e.status===409);assert.equal(f.calls.some(c=>c.sql.startsWith('INSERT INTO operations.shopping_dispatches')),false);}
 const f=fixture();f.state.phone='invalid';const q=await f.service.quote(f.read,f.req);assert.ok(q.groups[0].issues.some(i=>i.includes('WhatsApp')));await assert.rejects(()=>f.service.checkout(f.write,{requisitionId:f.req,fingerprint:q.fingerprint},'123e4567-e89b-42d3-a456-426614174022',2),e=>e.status===400);
 const offerInput={materialId:offer.material_id,supplierId:offer.supplier_id,unit:'box',unitPrice:'12',currency:'GBP',vatRate:'20',includesVat:true,minimumQuantity:'1',availableQuantity:'20',validUntil:'2099-01-01T00:00:00.000Z',sourceReference:'Synthetic verified supplier quote'};
 const contactInput={supplierId:offer.supplier_id,phone:'+441234567890',method:'supplier_call',sourceReference:'Synthetic supplier call'};
 await assert.rejects(()=>f.service.configureOffer(f.read,offerInput,'key'),e=>e.status===403);
 await assert.rejects(()=>f.service.configureWhatsapp(f.read,contactInput,'key'),e=>e.status===403);
 await assert.rejects(()=>f.service.configureWhatsapp({...f.read,permission:'procurement:approve'},{...contactInput,phone:'02012345678'},'key'),e=>e.status===400);
 await assert.rejects(()=>f.service.offers({...f.read,companyId:'foreign'}),e=>e.status===403);
 await assert.rejects(async()=>f.service.checkout(f.read,{requisitionId:f.req,fingerprint:q.fingerprint},'key',2),e=>e.status===403);
});

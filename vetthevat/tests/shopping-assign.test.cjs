const test=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const {shoppingService}=loadSource('lib/server/ors/shopping');
const company='2a84b52d-4c04-4ae8-8ba3-3bb5fb3e23cd',actor='7424be65-4df2-4d23-bf79-4ae9479d235a',requisition='ae5f2665-ff43-4cb4-83fc-f312fe292d96',buyer='3a8956e9-6a91-4c14-bf6d-cac42e3fc8a9';
test('buyer response exposes manager-only assignment capability separately from eligible buyers',async()=>{
 const database={scoped:async(scope,operation)=>operation({companyId:company,permission:scope.permission,query:async(sql)=>sql.includes('shopping_buyers')?{rows:[{id:buyer,name:'Synthetic buyer',role:'Procurement'}]}:{rows:[{allowed:false}]}})};
 const result=await shoppingService(database).buyers({companyId:company,sessionCookie:'opaque',permission:'procurement:read'});assert.equal(result.canAssign,false);assert.equal(result.items[0].id,buyer);
});
test('assigned buyer inbox retains delivered and cancelled requisitions for history',async()=>{
 let statement='',values=[];
 const database={scoped:async(scope,operation)=>operation({companyId:company,actorId:actor,permission:scope.permission,query:async(sql,args=[])=>{statement=sql;values=args;return {rows:[]};}})};
 await shoppingService(database).inbox({companyId:company,sessionCookie:'opaque',permission:'procurement:read'});
 assert.match(statement,/r\.company_id=\$1 AND r\.assigned_buyer_id=\$2/);
 for(const state of ['accepted','purchasing','partially_purchased','purchased','delivered','cancelled'])assert.ok(statement.includes(`'${state}'`));
 assert.deepEqual(values,[company,actor]);
});
test('assign rejects suspended or unverified buyers before purchase requests are created',async()=>{
 let payloadHash,buyerSql='',managerSql='',purchaseRequestWrites=0;
 const database={scoped:async(scope,operation)=>operation({companyId:company,actorId:actor,permission:scope.permission,query:async(sql,values=[])=>{
  if(sql.startsWith('INSERT INTO business.command_keys')){payloadHash=values[5];return {rows:[],rowCount:1};}
  if(sql.startsWith('SELECT payload_hash,response'))return {rows:[{payload_hash:payloadHash,response:null}],rowCount:1};
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT operations.shopping_assignment_manager')){managerSql=sql;return {rows:[{allowed:true}],rowCount:1};}
  if(sql.startsWith('SELECT id::text,state,version FROM operations.shopping_requisitions'))return {rows:[{id:requisition,state:'draft',version:1}],rowCount:1};
  if(sql.startsWith('SELECT id::text FROM operations.shopping_buyers')||sql.startsWith('SELECT id::text,name,role FROM operations.shopping_buyers')){buyerSql=sql;return {rows:[],rowCount:0};}
  if(sql.startsWith('INSERT INTO operations.purchase_requests'))purchaseRequestWrites++;
  return {rows:[],rowCount:1};
 }})};
 const service=shoppingService(database),scope={companyId:company,sessionCookie:'opaque',permission:'procurement:write'};
 await assert.rejects(service.assign(scope,{requisitionId:requisition,buyerId:buyer,version:1,requiredOn:null,priority:'normal',instructions:null},'shopping-assign-test-key-123'),/verified, active company member/);
 assert.match(managerSql,/shopping_assignment_manager/);assert.match(buyerSql,/operations\.shopping_buyers/);assert.equal(purchaseRequestWrites,0);
});
test('ordinary purchasing staff cannot assign a company requisition',async()=>{
 let payloadHash,requestCreated=false;
 const database={scoped:async(scope,operation)=>operation({companyId:company,actorId:actor,permission:scope.permission,query:async(sql,values=[])=>{
  if(sql.startsWith('INSERT INTO business.command_keys')){payloadHash=values[5];return {rows:[],rowCount:1};}
  if(sql.startsWith('SELECT payload_hash,response'))return {rows:[{payload_hash:payloadHash,response:null}],rowCount:1};
  if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}],rowCount:1};
  if(sql.startsWith('SELECT operations.shopping_assignment_manager'))return {rows:[{allowed:false}],rowCount:1};
  if(sql.startsWith('INSERT INTO operations.purchase_requests'))requestCreated=true;
  return {rows:[],rowCount:1};
 }})};
 await assert.rejects(shoppingService(database).assign({companyId:company,sessionCookie:'opaque',permission:'procurement:write'},{requisitionId:requisition,buyerId:buyer,version:1,requiredOn:null,priority:'normal',instructions:null},'shopping-assign-staff-123'),error=>error.status===403);
 assert.equal(requestCreated,false);
});

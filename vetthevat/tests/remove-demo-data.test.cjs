const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const legacy=loadSource('tests/fixtures/legacy-workspace');
const {restoreWorkspace,workspaceStorageKey}=loadSource('lib/workspace');
const {emptyWorkspace,loadLocalWorkspace,legacyRecordReview,exportLocalWorkspace}=loadSource('lib/workspace-bootstrap');
function sample(){return restoreWorkspace(JSON.stringify({invoices:legacy.invoices,documents:legacy.documents}),{...legacy,selectedCompanyId:legacy.companies[0].id,settings:{}});}
function storage(raw){const values=new Map(raw===null?[]:[[workspaceStorageKey,raw]]);const writes=[];return {values,writes,getItem:key=>values.get(key)??null,setItem:(key,value)=>{writes.push(key);values.set(key,value)}};}
test('fresh storage starts completely empty without writing or seeding records',()=>{
 const store=storage(null),state=loadLocalWorkspace(store);
 for(const key of ['companies','invoices','documents','suppliers','customers','teamMembers','tickets','notifications','auditLog'])assert.deepEqual(state[key],[]);
 assert.equal(state.selectedCompanyId,'');assert.equal(store.values.size,0);assert.deepEqual(store.writes,[]);
 assert.deepEqual(loadLocalWorkspace(store),emptyWorkspace());
});
test('even unchanged historical records require review and are never deleted on hydration',()=>{
 const state=sample(),raw=JSON.stringify(state),store=storage(raw),loaded=loadLocalWorkspace(store);
 for(const key of ['companies','invoices','documents','suppliers','teamMembers','tickets','notifications','auditLog'])assert.equal(loaded[key].length,state[key].length);
 assert.ok(legacyRecordReview(loaded).length>0);assert.equal(store.values.get(workspaceStorageKey),raw);assert.deepEqual(store.writes,[]);
});
test('genuine edits and links survive repeated reloads, with an exact recoverable raw export',()=>{
 const state=sample();state.invoices[0].notes='User-created edit';state.invoices.push({...state.invoices[0],id:'genuine-user-invoice',invoiceNumber:'REAL-PRIVATE'});
 state.customers=[{id:'user-customer',companyId:state.selectedCompanyId,name:'User customer',status:'Active'}];
 state.unknownFutureData={private:'preserved'};
 const raw=JSON.stringify(state,null,2),store=storage(raw);
 for(let i=0;i<3;i++){const restored=loadLocalWorkspace(store);assert.equal(restored.invoices[0].notes,'User-created edit');assert.equal(restored.invoices.length,state.invoices.length);assert.equal(restored.customers.length,1);assert.deepEqual(restored.unknownFutureData,state.unknownFutureData);}
 assert.equal(exportLocalWorkspace(store),raw);assert.equal(store.values.get(workspaceStorageKey),raw);assert.deepEqual(store.writes,[]);
});
test('business names, dates and amounts never classify a genuine record as removable',()=>{
 const state=emptyWorkspace();state.companies=[{id:'genuine-id',name:'Demo Business Ltd',currency:'GBP'}];state.selectedCompanyId='genuine-id';
 const store=storage(JSON.stringify(state));assert.equal(loadLocalWorkspace(store).companies.length,1);assert.deepEqual(legacyRecordReview(state),[]);
});
test('malformed storage is not reset and can still be exported exactly for recovery',()=>{
 const raw='not valid JSON: private metadata',store=storage(raw);assert.throws(()=>loadLocalWorkspace(store));assert.equal(exportLocalWorkspace(store),raw);assert.equal(store.values.get(workspaceStorageKey),raw);assert.deepEqual(store.writes,[]);
});

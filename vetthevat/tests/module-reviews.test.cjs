const test=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const {moduleReviewService,moduleReviewsEnabled}=loadSource('lib/server/procurement/module-reviews');
const doc='ae5f2665-ff43-4cb4-83fc-f312fe292d96',company='2a84b52d-4c04-4ae8-8ba3-3bb5fb3e23cd',actor='7424be65-4df2-4d23-bf79-4ae9479d235a';
test('module review feature is disabled unless runtime flag and pinned schema checksum both match',()=>{
 assert.equal(moduleReviewsEnabled({}),false);assert.equal(moduleReviewsEnabled({SAAS_MODULE_REVIEWS_ENABLED:'1',SAAS_MODULE_REVIEWS_SCHEMA_SHA256:'wrong'}),false);
 assert.equal(moduleReviewsEnabled({SAAS_MODULE_REVIEWS_ENABLED:'1',SAAS_MODULE_REVIEWS_SCHEMA_SHA256:'4f646c518a5aa10fa6155534bf74124d594a1dada26630797676a1ccf3eac0ce'}),true);
});
test('VAT and ORS queue reads require their own capability and remain read-only',async()=>{
 let calls=0;const database={scoped:async(scope,operation)=>{assert.equal(scope.permission,'invoices:read');return operation({companyId:company,permission:scope.permission,query:async(sql,values)=>{calls++;assert.match(sql,/module_reviews/);assert.match(sql,/purposes/);assert.match(sql,/documents/);assert.match(sql,/d\.state IN\('quarantined','clean'\)/);assert.deepEqual(values,[company,'vat','invoices:write']);return {rows:[{id:doc,purpose:'both',review_state:'pending',can_write:true}],rowCount:1};}});}};
 const service=moduleReviewService(database);assert.throws(()=>service.list({companyId:company,sessionCookie:'opaque',permission:'invoices:read'},'ors'),error=>error.status===403);
 const result=await service.list({companyId:company,sessionCookie:'opaque',permission:'invoices:read'},'vat');assert.equal(result.items[0].id,doc);assert.equal(calls,1);
});
test('review transition checks current version, writes a single module state and audit event',async()=>{
 const calls=[];const database={scoped:async(scope,operation)=>operation({companyId:company,actorId:actor,permission:scope.permission,query:async(sql,values)=>{calls.push({sql,values});if(sql.startsWith('SELECT r.state'))return {rows:[{state:'in_review',version:'2'}],rowCount:1};if(sql.startsWith('UPDATE invoice_routing.module_reviews'))return {rows:[{state:'reviewed',version:'3',reviewed_at:'2026-10-30T00:00:00Z'}],rowCount:1};return {rows:[],rowCount:1};}})};
 const service=moduleReviewService(database),scope={companyId:company,sessionCookie:'opaque',permission:'invoices:write'};
 const result=await service.transition(scope,doc,'vat','reviewed',2);assert.equal(result.version,3);assert.equal(result.unchanged,false);assert.ok(calls[0].sql.includes('FOR UPDATE OF r'));assert.deepEqual(calls[1].values,[company,doc,'vat','reviewed',actor,2]);assert.equal(calls.filter(call=>call.sql.includes('saas.audit_events')).length,1);assert.equal(calls.at(-1).values[2],'document.vat-review-reviewed');
});
test('stale review versions conflict before update or audit',async()=>{
 let updates=0;const database={scoped:async(scope,operation)=>operation({companyId:company,permission:scope.permission,query:async sql=>{if(sql.startsWith('SELECT r.state'))return {rows:[{state:'in_review',version:'5'}]};updates++;return {rows:[]};}})};
 await assert.rejects(moduleReviewService(database).transition({companyId:company,sessionCookie:'opaque',permission:'procurement:write'},doc,'ors','reviewed',4),{status:409});assert.equal(updates,0);
});

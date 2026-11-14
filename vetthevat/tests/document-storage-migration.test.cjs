const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {migrateLocalDocumentObjects,restoreR2DocumentObjects}=require('./load-source.cjs').loadSource('lib/server/saas/document-storage-migration');
const {originalKey}=require('./load-source.cjs').loadSource('lib/server/saas/object-storage');

function fixture(){
 const companyId=crypto.randomUUID(),documentId=crypto.randomUUID(),bytes=Buffer.from('%PDF-1.4\ninvoice storage migration fixture\n%%EOF'),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const item={companyId,documentId,mime:'application/pdf',original:{key:originalKey(companyId,documentId,sha256),version:sha256,sha256,byteSize:bytes.length}};
 const local=new Map([[item.original.key,bytes]]),remote=new Map();
 const source={put:async()=>{throw Error('not used');},read:async original=>{const value=local.get(original.key);if(!value)throw Error('missing local object');return Buffer.from(value);}};
 const target={
  async put(input){const key=originalKey(input.companyId,input.documentId,crypto.createHash('sha256').update(input.bytes).digest('hex'));if(remote.has(key)){const existing=remote.get(key);return {...input.original,key,sha256:crypto.createHash('sha256').update(existing).digest('hex'),byteSize:existing.length,version:crypto.createHash('sha256').update(existing).digest('hex')};}remote.set(key,Buffer.from(input.bytes));return {key,sha256:item.original.sha256,byteSize:input.bytes.length,version:item.original.sha256};},
  async read(original){const value=remote.get(original.key);if(!value)throw Error('missing remote object');return Buffer.from(value);},
  async listKeys(){return [...remote.keys()].sort();}
 };
 return {item,local,remote,source,target};
}

test('R2 migration dry-run verifies local source, creates a bound plan and performs no writes',async()=>{
 const {item,local,remote,source,target}=fixture(),result=await migrateLocalDocumentObjects([item],source,target,{dryRun:true,destination:'account/bucket'});
 assert.equal(result.objectCount,1);assert.equal(result.sourceVerified,1);assert.equal(result.targetVerified,0);assert.equal(result.missing,1);assert.equal(result.copied,0);assert.match(result.planHash,/^[a-f0-9]{64}$/);assert.equal(remote.size,0);assert.equal(local.size,1);assert.equal(result.localOriginalsDeleted,false);
});

test('R2 migration requires the exact dry-run plan, copies, verifies checksums/counts and retains local originals',async()=>{
 const {item,local,remote,source,target}=fixture(),dryRun=await migrateLocalDocumentObjects([item],source,target,{dryRun:true,destination:'account/bucket'});
 await assert.rejects(migrateLocalDocumentObjects([item],source,target,{dryRun:false,expectedPlanHash:'0'.repeat(64),destination:'account/bucket'}),{status:409});
 const result=await migrateLocalDocumentObjects([item],source,target,{dryRun:false,expectedPlanHash:dryRun.planHash,destination:'account/bucket'});
 assert.equal(result.copied,1);assert.equal(result.targetVerified,1);assert.equal(result.verifiedObjectCount,1);assert.equal(result.objectCount,1);assert.equal(remote.size,1);assert.equal(local.size,1);
});

test('R2 migration resumes after a partial copy and rejects foreign destination objects',async()=>{
 const {item,local,remote,source,target}=fixture(),dryRun=await migrateLocalDocumentObjects([item],source,target,{dryRun:true,destination:'account/bucket'});
 const failing={...target,put:async input=>{await target.put(input);throw Error('simulated interruption');}};
 await assert.rejects(migrateLocalDocumentObjects([item],source,failing,{dryRun:false,expectedPlanHash:dryRun.planHash,destination:'account/bucket'}));
 const resumedDryRun=await migrateLocalDocumentObjects([item],source,target,{dryRun:true,destination:'account/bucket'});
 const resumed=await migrateLocalDocumentObjects([item],source,target,{dryRun:false,expectedPlanHash:resumedDryRun.planHash,destination:'account/bucket'});
 assert.equal(resumed.alreadyPresent,1);assert.equal(resumed.copied,0);assert.equal(resumed.verifiedObjectCount,1);assert.equal(local.size,1);
 await assert.rejects(migrateLocalDocumentObjects([item],source,{...target,listKeys:async()=>[...remote.keys(),'companies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/documents/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/'+'c'.repeat(64)]},{dryRun:true,destination:'account/bucket'}),{status:409});
});

test('rollback copy verifies R2 inventory and restores new objects locally without deleting R2 originals',async()=>{
 const {item,local,remote,source,target}=fixture(),dryRun=await migrateLocalDocumentObjects([item],source,target,{dryRun:true,destination:'account/bucket'});
 await migrateLocalDocumentObjects([item],source,target,{dryRun:false,expectedPlanHash:dryRun.planHash,destination:'account/bucket'});local.clear();
 const r2Source={listKeys:async()=>[...remote.keys()],read:target.read,put:target.put};
 const localTarget={has:async original=>local.has(original.key),read:source.read,put:async input=>{local.set(originalKey(input.companyId,input.documentId,item.original.sha256),Buffer.from(input.bytes));return item.original;}};
 const restorePlan=await restoreR2DocumentObjects([item],r2Source,localTarget,{dryRun:true,destination:'configured-private-local-store'});
 assert.equal(restorePlan.missing,1);assert.equal(local.size,0);
 const restored=await restoreR2DocumentObjects([item],r2Source,localTarget,{dryRun:false,expectedPlanHash:restorePlan.planHash,destination:'configured-private-local-store'});
 assert.equal(restored.copied,1);assert.equal(restored.verifiedObjectCount,1);assert.equal(remote.size,1);assert.equal(local.size,1);
});

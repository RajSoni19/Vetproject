const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadSource}=require('./load-source.cjs');
const storage=loadSource('lib/server/saas/object-storage');
const {processSupplierLogoJob}=loadSource('lib/server/saas/supplier-logo-worker');
const {supplierLogoService}=loadSource('lib/server/saas/supplier-logos');
const {localPrivateOriginals}=loadSource('lib/server/saas/local-originals');

test('supplier image keys and metadata are tenant/supplier/asset scoped and content addressed',()=>{
 const company=crypto.randomUUID(),supplier=crypto.randomUUID(),asset=crypto.randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
 const stored=storage.supplierLogoMetadata({companyId:company,supplierId:supplier,assetId:asset,mime:'image/png',bytes});
 assert.equal(stored.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
 assert.equal(stored.key,`companies/${company}/suppliers/${supplier}/logos/${asset}/${stored.sha256}`);
 assert.throws(()=>storage.supplierLogoMetadata({companyId:company,supplierId:supplier,assetId:asset,mime:'image/jpeg',bytes}));
 assert.throws(()=>storage.checkPrivateAsset({...stored,key:stored.key.replace(sha256,'0'.repeat(64))}));
 assert.equal(storage.supplierLogoUploadLimit({}),2*1024*1024);
 assert.throws(()=>storage.supplierLogoUploadLimit({SAAS_SUPPLIER_LOGO_MAX_BYTES:'999999999'}));
});

test('isolated supplier-logo worker scans the exact privately stored bytes and publishes only a clean receipt',async()=>{
 const company=crypto.randomUUID(),supplier=crypto.randomUUID(),assetId=crypto.randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10,7,8]);
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),lease={jobId:crypto.randomUUID(),leaseId:crypto.randomUUID(),companyId:company,supplierId:supplier,assetId,asset:{key:`companies/${company}/suppliers/${supplier}/logos/${assetId}/${sha256}`,version:sha256,sha256,byteSize:bytes.length,mime:'image/png'}};
 let finished;
 const result=await processSupplierLogoJob({claim:async()=>lease,finish:async(current,receipt)=>{assert.equal(current,lease);finished=receipt;return true;}},{readAsset:async()=>bytes},{inspect:async(exact,mime)=>{assert.deepEqual(Buffer.from(exact),bytes);assert.equal(mime,'image/png');return {verdict:'clean',engine:'ClamAV test',policy:'bounded-image-v1'};}},new AbortController().signal);
 assert.deepEqual(result,{state:'clean'});assert.deepEqual(finished,{verdict:'clean',engine:'ClamAV test',policy:'bounded-image-v1'});
});

test('local private asset is durably written before its isolated worker reads and scans the same bytes',async()=>{
 const company=crypto.randomUUID(),supplier=crypto.randomUUID(),assetId=crypto.randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10,4,5,6]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-supplier-logo-')),env={SAAS_LOCAL_ORIGINALS_DIR:root,SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',SAAS_DATABASE_APPROVED:'vtv_saas_dev',WEB_AUTH_ENV:'test',WEB_AUTH_ORIGIN:'https://localhost:3444'};
 try{
  const assets=localPrivateOriginals(env,process.cwd()),stored=await assets.putAsset({companyId:company,supplierId:supplier,assetId,mime:'image/png',bytes});
  const physical=path.join(root,crypto.createHash('sha256').update(stored.key).digest('hex')+'.asset');assert.equal(fs.readFileSync(physical).compare(bytes),0);
  let scanned;
  const result=await processSupplierLogoJob({claim:async()=>({jobId:crypto.randomUUID(),leaseId:crypto.randomUUID(),companyId:company,supplierId:supplier,assetId,asset:stored}),finish:async()=>true},assets,{inspect:async(exact,mime)=>{scanned=Buffer.from(exact);assert.equal(mime,'image/png');return {verdict:'clean',engine:'test-scanner',policy:'bounded-image-v1'};}},new AbortController().signal);
  assert.deepEqual(result,{state:'clean'});assert.deepEqual(scanned,bytes);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('supplier-logo upload persists storage before creating the tenant-scoped scan job',async()=>{
 const company=crypto.randomUUID(),supplier=crypto.randomUUID(),actor=crypto.randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10,1,2]),order=[];
 const database={scoped:async(_scope,operation)=>operation({companyId:company,actorId:actor,sessionId:crypto.randomUUID(),permission:'contacts:write',query:async(sql)=>{order.push(sql);return {rows:sql.includes('SELECT kind')?[{kind:'supplier'}]:[],rowCount:1};}})};
 const service=supplierLogoService(database,{putAsset:async(input)=>{order.push('storage:durable');const metadata=storage.supplierLogoMetadata(input);return {...metadata,version:metadata.sha256};}});
 const result=await service.upload({companyId:company,sessionCookie:'unused',permission:'contacts:write'},supplier,{bytes,mime:'image/png',byteSize:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 assert.equal(result.state,'pending');assert.ok(order.indexOf('storage:durable')<order.findIndex(sql=>typeof sql==='string'&&sql.includes('INSERT INTO business.supplier_logo_assets')));assert.ok(order.findIndex(sql=>typeof sql==='string'&&sql.includes('INSERT INTO business.supplier_logo_assets'))<order.findIndex(sql=>typeof sql==='string'&&sql.includes('INSERT INTO business.supplier_logo_jobs')));
});

test('logo scan errors never create a clean verdict and remain explicit',async()=>{
 const company=crypto.randomUUID(),supplier=crypto.randomUUID(),assetId=crypto.randomUUID(),bytes=Buffer.from([137,80,78,71,13,10,26,10]);
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),lease={jobId:crypto.randomUUID(),leaseId:crypto.randomUUID(),companyId:company,supplierId:supplier,assetId,asset:{key:`companies/${company}/suppliers/${supplier}/logos/${assetId}/${sha256}`,version:sha256,sha256,byteSize:bytes.length,mime:'image/png'}};
 let finished;
 const result=await processSupplierLogoJob({claim:async()=>lease,finish:async(_lease,receipt)=>{finished=receipt;return true;}},{readAsset:async()=>{throw Error('storage offline');}},{inspect:async()=>({verdict:'clean',engine:'ClamAV',policy:'bounded-image-v1'})},new AbortController().signal);
 assert.deepEqual(result,{state:'error'});assert.equal(finished.verdict,'error');
});

test('supplier-logo migration is parseable, additive, tenant-isolated and not wired into the old OCR queue',async()=>{
 const sql=fs.readFileSync('database/migrations/saas/036_supplier_logo_assets.review.sql','utf8'),{parse}=require('libpg-query'),ast=await parse(sql);
 assert.ok(ast.version>=170000&&ast.version<180000);
 assert.match(sql,/current_database\(\)<>'vtv_saas_dev'/);assert.match(sql,/inet_server_port\(\)<>55440/);assert.match(sql,/session_user<>'vtv_saas_operator'/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);assert.match(sql,/business\.claim_supplier_logo_inspection/);assert.match(sql,/business\.finish_supplier_logo_inspection/);
 assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),'54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4');
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+(?:saas\.)?documents/i);assert.doesNotMatch(sql,/business\.extraction_jobs/);
 assert.doesNotMatch(sql,/ALTER\s+TABLE\s+(?:business\.(?!supplier_logo_)|saas\.)/i);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});

test('supplier-logo claim correction is pinned to the installed function and renames only the conflicting table alias',async()=>{
 const {candidate}=require('../scripts/saas-reviewed-migration.cjs'),sql=fs.readFileSync('database/migrations/saas/038_supplier_logo_claim_alias_fix.review.sql','utf8'),{parse}=require('libpg-query');
 const ast=await parse(sql);
 assert.ok(ast.version>=170000&&ast.version<180000);
 assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),'8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087');
 assert.equal(candidate('038-supplier-logo-claim-alias-fix').expectedFunctionHash,'597bd0fd6deaa4803a47fc7ae277a139a78581490a305b6a7ffe1002a645be6f');
 assert.match(sql,/current_database\(\)<>'vtv_saas_dev'/);assert.match(sql,/inet_server_port\(\)<>55440/);assert.match(sql,/session_user<>'vtv_saas_operator'/);
 assert.match(sql,/business\.supplier_logo_assets AS asset_row/);assert.match(sql,/asset_row\.state='pending'/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION business\.claim_supplier_logo_inspection/);
 assert.doesNotMatch(sql,/CREATE TABLE|ALTER TABLE|DROP TABLE|INSERT\s+INTO|business\.extraction_jobs/i);
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});

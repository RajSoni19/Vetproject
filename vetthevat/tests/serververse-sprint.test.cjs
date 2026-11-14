const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {assess}=require('../scripts/deployment/serververse-capacity.cjs'),{assess:monitor}=require('../deploy/ubuntu/monitor.cjs'),{loadSource}=require('./load-source.cjs');
test('capacity gate requires measured exclusive headroom and never disables ClamAV to fit',()=>{
 const audit={hostIdentityVerified:true,existingApplicationsPreserved:true,os:'ubuntu-24.04',architecture:'x64',availableVtvMemoryMiB:16000,availableVtvVcpu:4,availableVtvDiskGiB:60,databaseGiB:2,originalsGiB:5,applicationPort:3200,postgresPort:55432,listeningPorts:[22,80,443],auditedAt:new Date().toISOString()};
 assert.equal(assess(audit).recommendation,'CAPACITY-REVIEW-PASSED');
 for(const patch of [{availableVtvMemoryMiB:8000},{availableVtvVcpu:2},{listeningPorts:[3200]},{hostIdentityVerified:false},{postgresPort:55440},{availableVtvDiskGiB:4},{auditedAt:null}])assert.equal(assess({...audit,...patch}).recommendation,'NO-GO');
 assert.equal(assess({}).productionReady,false);
});
test('monitor reports app/DB, worker, scanner, disk and recovery failures without payloads',()=>{
 const now=Date.now(),at=new Date(now).toISOString(),data={ready:true,diskPercent:35,release:'synthetic',workers:[{kind:'inspect',value:{kind:'inspect',release:'synthetic',at,state:'idle'}}],backup:{at,offHostVerified:true},restore:{at,passed:true},scannerReady:true};
 assert.equal(monitor(data,now).healthy,true);
 for(const patch of [{ready:false},{diskPercent:90},{workers:[]},{scannerReady:false},{backup:null},{restore:null}])assert.equal(monitor({...data,...patch},now).healthy,false);
 const {signatureFresh}=require('../deploy/ubuntu/monitor.cjs');assert.equal(signatureFresh('ClamAV 1.5.4/123/'+new Date(now-3600000).toUTCString(),now),true);assert.equal(signatureFresh('ClamAV 1.5.4/123/'+new Date(now-48*3600000).toUTCString(),now),false);assert.equal(signatureFresh('unknown',now),false);
});
test('TLS mode is explicit and custom internal ports are rendered without weakening the default',()=>{
 const dir=path.resolve('.deployment-review','tls-'+crypto.randomUUID());
 try{require('../scripts/deployment/render.cjs').render('production','vetthevat.com',dir,{port:3251,tlsMode:'origin-tls'});const sql=fs.readFileSync(path.join(dir,'nginx-site.conf'),'utf8');assert.match(sql,/127\.0\.0\.1:3251/);assert.match(sql,/ssl_protocols TLSv1.2 TLSv1.3/);assert.doesNotMatch(sql,/ssl_verify_client on|ssl_client_certificate/);const m=JSON.parse(fs.readFileSync(path.join(dir,'render-manifest.json')));assert.equal(m.deploymentApproved,false);assert.equal(m.hostAudited,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('shared immutable byte store verifies originals and read-only worker identities cannot write',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-production-store-')),factory=loadSource('lib/server/saas/local-originals').filesystemOriginalStore;
 try{const store=factory(root),input={companyId:crypto.randomUUID(),documentId:crypto.randomUUID(),mime:'application/pdf',bytes:Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')},saved=await store.put(input),readOnly=factory(root,{readOnly:true});assert.deepEqual(await readOnly.read(saved),input.bytes);await assert.rejects(readOnly.put(input),{status:403});await assert.rejects(readOnly.read({...saved,key:'../../escape'}),{status:503});}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('worker refuses a changed 037 fence before issuing any claim query',async()=>{
 const {documentWorkerStore}=loadSource('lib/server/saas/worker-store'),calls=[];
 const query=async sql=>{calls.push(sql);return {rows:sql.includes('current_database()')?[{database:'vtv_saas_dev',host:'127.0.0.1',port:55440,role:'vtv_saas_document_worker',session_role:'vtv_saas_document_worker',installation:'test',safe:true}]:sql.includes('local_document_scope')?[{created_after:new Date('2026-10-30T16:50:33.492Z')}]:[]};};
 await documentWorkerStore({query},'test').claim('inspect');assert.ok(calls.some(sql=>sql.includes('claim_local_inspection')));assert.ok(!calls.some(sql=>sql==='SELECT * FROM business.claim_inspection()'));
 calls.length=0;const wrong=async sql=>sql.includes('local_document_scope')?{rows:[{created_after:new Date('2026-10-31T00:00:00Z')}]}:query(sql);
 await assert.rejects(documentWorkerStore({query:wrong},'test').claim('inspect'),{status:503});assert.ok(!calls.some(sql=>sql.includes('claim_local')));
});
test('ServerVerse filesystem storage stays disabled unless independently approved',()=>{
 const {serverversePrivateOriginals}=loadSource('lib/server/saas/serververse-originals');assert.equal(serverversePrivateOriginals({}),undefined);assert.throws(()=>serverversePrivateOriginals({VTV_PRIVATE_ORIGINALS_ENABLED:'1'}),{status:503});
});

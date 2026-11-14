// Full real-file/native OCR + local PostgreSQL test. ONLY fixture-specific leases
// are assigned; never invoke a global queue claim or start a queue-draining loop.
const s=require('./saas-services.cjs'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {loadSource,assert,crypto}=s;
const fence='2026-10-30T16:50:33.492Z';
async function legacySnapshot(){return s.operator(async db=>{
 const actual=(await db.query('SELECT created_after FROM business.local_document_scope WHERE singleton')).rows[0].created_after.toISOString();assert.equal(actual,fence);
 const rows=(await db.query(`SELECT to_jsonb(j)::text value FROM saas.document_jobs j JOIN saas.documents d ON d.company_id=j.company_id AND d.id=j.document_id WHERE d.created_at<$1 UNION ALL SELECT to_jsonb(j)::text FROM business.extraction_jobs j JOIN saas.documents d ON d.company_id=j.company_id AND d.id=j.document_id WHERE d.created_at<$1 ORDER BY value`,[fence])).rows;
 return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
});}
async function main(){
 const before=await legacySnapshot(),{database,pool}=s.business(),results=[];
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-sprint-ocr-')),originals=loadSource('lib/server/saas/local-originals').filesystemOriginalStore(root),documents=loadSource('lib/server/saas/documents').documentWorkflow(database,originals);
 const user=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('sprint-ocr')),company=await s.companyFor(user.userId),other=await s.companyFor(user.userId),scope=permission=>({sessionCookie:user.token,companyId:company,permission}),key=()=>crypto.randomUUID();
 await s.operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Growth','active',300,3,6,NULL,true,now(),'synthetic-sprint-ocr-not-payment' FROM saas.company_profiles WHERE company_id=ANY($1::uuid[])",[[company,other]]));
 const worker=new s.Client(s.connection('vtv_saas_operator'));await worker.connect();await worker.query('SET SESSION AUTHORIZATION vtv_saas_document_worker');
 const finish=loadSource('lib/server/saas/worker-store').documentWorkerStore(worker,s.configuration().installationId);
 const native=(route,file,mime)=>JSON.parse(execFileSync('wsl.exe',['-d','Ubuntu-24.04','--','bash','-l','/mnt/d/vetthevat/tests/native-processor-call.sh',process.argv[2],route,'/mnt/d/vetthevat/docs/test-results/'+file,mime],{encoding:'utf8',windowsHide:true,timeout:80000}));
 try{
  for(const [file,mime] of [['supplier-multipage.pdf','application/pdf'],['supplier-lines.png','image/png']]){
   const bytes=fs.readFileSync('docs/test-results/'+file),input={bytes,byteSize:bytes.length,mimeType:mime,originalName:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},upload=await documents.intake(scope('documents:write'),input,key());
   assert.equal(upload.state,'quarantined');assert.equal((await documents.intake(scope('documents:write'),input,key())).id,upload.id);await assert.rejects(documents.download(scope('documents:read'),upload.id),e=>e.status===404);
   for(const kind of ['inspect','extract']){
    const lease=await s.operator(async db=>{const table=kind==='inspect'?'saas.document_jobs':'business.extraction_jobs';const row=(await db.query(`UPDATE ${table} SET state='processing',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds' WHERE company_id=$1 AND document_id=$2 AND state='queued' RETURNING id::text,lease_id::text`,[company,upload.id])).rows[0];assert.ok(row,'only this synthetic job was leased');const d=(await db.query('SELECT object_key,object_version,sha256,byte_size,mime_type FROM saas.documents WHERE company_id=$1 AND id=$2 AND created_at>=$3',[company,upload.id,fence])).rows[0];assert.ok(d);return {jobId:row.id,leaseId:row.lease_id,companyId:company,documentId:upload.id,mime,original:{key:d.object_key,version:d.object_version,sha256:d.sha256,byteSize:Number(d.byte_size)}};});
    const store={claim:async requested=>{assert.equal(requested,kind);return lease;},finishInspection:finish.finishInspection,finishExtraction:finish.finishExtraction};
    const result=await loadSource('lib/server/saas/document-worker').processDocumentJob(kind,store,originals,{inspection:{inspect:async data=>{assert.deepEqual(Buffer.from(data),bytes);return native('/inspect',file,mime);}},ocr:{engine:'isolated-poppler-tesseract-v1',pages:async data=>{assert.deepEqual(Buffer.from(data),bytes);return native('/ocr',file,mime).pages;}}},new AbortController().signal);
    assert.equal(result.state,kind==='inspect'?'clean':'review-required');
   }
   const status=await documents.status(scope('documents:read'),upload.id);assert.equal(status.state,'clean');assert.equal(status.extraction,'completed');assert.deepEqual(Buffer.from((await documents.download(scope('documents:read'),upload.id)).bytes),bytes);await assert.rejects(documents.download({...scope('documents:read'),companyId:other},upload.id),e=>e.status===404);
   const observations=await s.operator(async db=>(await db.query('SELECT r.observations FROM business.extraction_results r JOIN business.extraction_jobs j ON j.company_id=r.company_id AND j.id=r.job_id WHERE j.company_id=$1 AND j.document_id=$2 ORDER BY r.page',[company,upload.id])).rows);
   assert.ok(observations.length);assert.match(JSON.stringify(observations),/Steel bolt/i);
   const invoices=loadSource('lib/server/saas/invoices').invoiceService(database),contact=await invoices.saveContact(scope('contacts:write'),{kind:'supplier',name:'Synthetic OCR supplier '+file,status:'active'},key());
   const invoiceInput={direction:'purchase',kind:'invoice',contactId:contact.id,number:'OCR-'+crypto.randomUUID(),issuedOn:'2026-11-07',dueOn:null,currency:'GBP',rounding:'line-half-up',notes:'Synthetic OCR observations reviewed and explicitly corrected',creditForId:null,lines:[{description:'Steel bolt',quantity:'3',unitPrice:'11',discount:'0',rate:'20',treatment:'standard',pricing:'exclusive'},{description:'Mystery part',quantity:'1',unitPrice:'5',discount:'0',rate:'0',treatment:'zero',pricing:'exclusive'}]};
   const draft=await invoices.create(scope('invoices:write'),invoiceInput,key());
   await invoices.attach(scope('invoices:write'),draft.id,upload.id,key(),Number(draft.version));
   const corrected=await invoices.replace(scope('invoices:write'),draft.id,{...invoiceInput,lines:invoiceInput.lines.map((line,i)=>i===0?{...line,unitPrice:'10'}:line)},key(),Number(draft.version));
   await invoices.confirm(scope('invoices:confirm'),draft.id,key(),Number(corrected.version));
   const confirmed=await invoices.detail(scope('invoices:read'),draft.id);
   assert.deepEqual([confirmed.invoice.net,confirmed.invoice.vat,confirmed.invoice.gross],['35.00','6.00','41.00']);assert.equal(confirmed.attachments.length,1);
   results.push({file,newUploadOnly:true,realClamAV:true,realTesseract:true,postgresExtractionCompleted:true,privateOriginalDigestVerified:true,duplicateStoredOnce:true,foreignCompanyDenied:true,manualCorrectionPersisted:true,confirmedNet:'35.00',confirmedVat:'6.00',confirmedGross:'41.00',cleanOriginalAttached:true});
  }
  const after=await legacySnapshot();assert.equal(after,before,'all pre-fence jobs must be unchanged');
  const report={passed:true,results,legacyQueueFence:fence,legacyQueueBeforeSha256:before,legacyQueueAfterSha256:after,oldJobsUnchanged:true,globalQueueClaims:0,leaseAssignment:'targeted synthetic fixture setup; real worker completion functions',migrationsExecuted:false,productionTouched:false};
  fs.mkdirSync('.deployment-review',{recursive:true});fs.writeFileSync('.deployment-review/sprint-ocr-postgres.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await worker.end();await pool.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

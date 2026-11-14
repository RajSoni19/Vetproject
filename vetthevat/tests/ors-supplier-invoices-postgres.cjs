// Real PostgreSQL, real local storage adapter. All document/queue/audit writes
// are rolled back; disposable identity/company fixtures remain for diagnostics.
const s=require('./saas-services.cjs'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assert,crypto,loadSource}=s;
async function main(){const {database,pool}=s.business(),results=[];let rolledBack=false;
 try{
 const schema=await s.operator(async db=>(await db.query("SELECT to_regclass('operations.supplier_invoice_reviews')::text AS reviews")).rows[0]);
 const account=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('supplier-extraction-pg')),company=await s.companyFor(account.userId),other=await s.companyFor(account.userId),scope={sessionCookie:account.token,companyId:company,permission:'documents:write'};
 await s.operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Starter','active',100,2,4,180,true,now(),'supplier-extraction-disposable-fixture' FROM saas.company_profiles WHERE company_id=ANY($1::uuid[])",[[company,other]]));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-supplier-originals-')),originals=loadSource('lib/server/saas/local-originals').localPrivateOriginals({WEB_AUTH_ENV:'test',WEB_AUTH_ORIGIN:'https://localhost:3444',SAAS_DATABASE_APPROVED:'vtv_saas_dev',SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',SAAS_LOCAL_ORIGINALS_DIR:root},process.cwd());assert.ok(originals);
 const rollback=new (loadSource('lib/server/api-v1').ApiError)(409,'CONFLICT','Intentional fixture rollback');
 try{await database.scoped(scope,async tx=>{try{
  // Nested service transactions share this one real runtime-role transaction,
  // repeat live authorization, and are rolled back together at the end.
  const scoped={scoped:async(access,work)=>{await tx.query("SELECT set_config('app.company_id',$1,true),set_config('app.permission',$2,true)",[access.companyId,access.permission]);const actor=(await tx.query('SELECT actor_id::text,session_id::text FROM saas.lock_authorization($1,$2)',[access.companyId,access.permission])).rows[0];assert.ok(actor);return work({...tx,companyId:access.companyId,permission:access.permission,actorId:actor.actor_id,sessionId:actor.session_id});}};
  const documents=loadSource('lib/server/saas/documents').documentWorkflow(scoped,originals),review=loadSource('lib/server/ors/supplier-invoices').supplierInvoiceService(scoped);
  for(const [file,mime] of [['supplier-multipage.pdf','application/pdf'],['supplier-lines.png','image/png']]){
   const bytes=fs.readFileSync('docs/test-results/'+file),input={bytes,byteSize:bytes.length,mimeType:mime,originalName:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},key=crypto.randomUUID();
   const upload=await documents.intake(scope,input,key);assert.equal(upload.state,'quarantined');const retry=await documents.intake(scope,input,key),repeat=await documents.intake(scope,input,crypto.randomUUID());assert.equal(retry.id,upload.id);assert.equal(repeat.id,upload.id);
   assert.equal((await scoped.scoped(scope,async t=>(await t.query('SELECT count(*)::int AS n FROM saas.documents WHERE company_id=$1 AND sha256=$2',[company,input.sha256])).rows[0])).n,1);
   assert.equal((await scoped.scoped(scope,async t=>(await t.query("SELECT count(*)::int AS n FROM saas.document_jobs WHERE company_id=$1 AND document_id=$2 AND kind='inspect'",[company,upload.id])).rows[0])).n,1);
   await assert.rejects(documents.download({...scope,permission:'documents:read'},upload.id),e=>e.status===404);
   await assert.rejects(review.load({...scope,permission:'procurement:read'},upload.id),e=>e.status===409);
   await assert.rejects(documents.status({...scope,companyId:other,permission:'documents:read'},upload.id),e=>e.status===404);
   const invisible=await scoped.scoped({...scope,companyId:other,permission:'documents:read'},async t=>(await t.query('SELECT id FROM saas.documents WHERE id=$1',[upload.id])).rows);assert.equal(invisible.length,0);
   results.push({file,realDatabase:true,realLocalStorage:true,retryAndContentDeduplication:true,oneInspectionJob:true,quarantineBlocksDownloadAndReview:true,companyIsolation:true});
  }
  await scoped.scoped(scope,async t=>{assert.equal((await t.query('SELECT count(*)::int AS n FROM operations.inventory_movements WHERE company_id=$1',[company])).rows[0].n,0);assert.equal((await t.query('SELECT count(*)::int AS n FROM business.invoices WHERE company_id=$1',[company])).rows[0].n,0);});
  throw rollback;
 }catch(error){if(error!==rollback)console.error(error.stack);throw error;}});}catch(e){if(e!==rollback)throw e;rolledBack=true;}
 const report={results,documentTransactionsRolledBack:rolledBack,syntheticOriginalsDirectory:root,reviewPersistence:schema.reviews?'schema-present: full confirmation tests still required':'BLOCKED: migration 036 not approved/applied',migrationsExecuted:false};fs.writeFileSync('docs/test-results/ors-supplier-postgres.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});

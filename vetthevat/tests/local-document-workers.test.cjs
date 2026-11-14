const test=require('node:test'),assert=require('node:assert/strict');
const {approvedEnvironment,childEnv,supplierLogoActivationApproved}=require('../scripts/local-document-workers.cjs');
const id='123e4567-e89b-42d3-a456-426614174000';
const base={NODE_ENV:'development',SAAS_INSTALLATION_ID:id,VTV_LOCAL_WORKER_INSTALLATION_ID:id,VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED:'172.20.240.1',VTV_LOCAL_WORKER_DATABASE_URL:'postgresql://vtv_saas_document_worker:test-password@172.20.240.1:55440/vtv_saas_dev',SAAS_LOCAL_ORIGINALS_DIR:'/mnt/c/Users/test/AppData/Local/VetTheVat/private-originals'};

test('local worker pins the approved database and shared LocalAppData storage',()=>{
 const env=approvedEnvironment(base,1000);
 assert.equal(env.VTV_DOCUMENT_WORKER_PROFILE,'local-wsl');
 assert.equal(env.VTV_DEPLOYMENT_PROFILE,'local');
 assert.equal(env.VTV_LOCAL_WORKER_UID,'1000');
 assert.equal(env.DOCUMENT_WORKER_ENABLED,'1');
 assert.equal(env.SAAS_LOCAL_ORIGINALS_DIR,base.SAAS_LOCAL_ORIGINALS_DIR);
 for(const patch of [
  {VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED:'172.20.240.2'},
  {VTV_LOCAL_WORKER_DATABASE_URL:'postgresql://vtv_saas_document_worker:test-password@8.8.8.8:55440/vtv_saas_dev'},
  {VTV_LOCAL_WORKER_DATABASE_URL:'postgresql://vtv_saas_document_worker:test-password@172.20.240.1:5432/vtv_saas_dev'},
  {VTV_LOCAL_WORKER_DATABASE_URL:'postgresql://vtv_saas_document_worker:test-password@172.20.240.1:55440/vtv_saas_production'},
  {VTV_LOCAL_WORKER_INSTALLATION_ID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  {SAAS_LOCAL_ORIGINALS_DIR:undefined},
  {SAAS_LOCAL_ORIGINALS_DIR:'/home/test/.local/share/VetTheVat/private-originals'},
  {SAAS_LOCAL_ORIGINALS_DIR:'/mnt/c/Users/test/AppData/Local/VetTheVat/other'}
 ])assert.throws(()=>approvedEnvironment({...base,...patch},1000));
});

test('supplier-logo worker requires the corrective migration activation hash',()=>{
 const env={SAAS_SUPPLIER_LOGOS_ENABLED:'1',SAAS_SUPPLIER_LOGO_SCHEMA_SHA256:'54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4',SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256:'8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087'};
 assert.equal(supplierLogoActivationApproved(env),true);
 assert.equal(supplierLogoActivationApproved({...env,SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256:undefined}),false);
});

test('new-upload queue fence is pinned and available for explicit review only',async()=>{
 const file='database/migrations/saas/037_local_document_queue_scope.review.sql',sql=require('node:fs').readFileSync(file,'utf8');
 assert.equal(require('node:crypto').createHash('sha256').update(sql).digest('hex'),'a994dbd39ebfed11cda2ad01bcecf812afe456accccf521610967337946a286b');
 await require('libpg-query').parse(sql);
 assert.equal(require('../scripts/saas-reviewed-migration.cjs').candidate('037-document-queue-scope').hash,'a994dbd39ebfed11cda2ad01bcecf812afe456accccf521610967337946a286b');
 assert.match(sql,/eligible\.created_at>=fence\.created_after/);
 assert.match(sql,/Document is outside the approved new-upload scope/);
});

test('processor receives no database credentials or unrelated application secrets',()=>{
 const env={...approvedEnvironment(base,1000),DOCUMENT_PROCESSING_SOCKET:'/run/user/1000/vtv-document-worker/processing.sock',CLAMAV_SOCKET:'/run/clamav/clamd.ctl',CLAMAV_INSPECTION_POLICY:'vtv-local-bounded-v1',SAAS_SUPPLIER_LOGOS_ENABLED:'1',SAAS_SUPPLIER_LOGO_SCHEMA_SHA256:'54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4',SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256:'8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087',SMTP_PASSWORD:'private',WEB_AUTH_OUTBOX_KEY:'private',PROVIDER_SECRET_KEY:'private'};
 const safe=childEnv(env,true);
 assert.equal(safe.CLAMAV_SOCKET,'/run/clamav/clamd.ctl');
 assert.equal(safe.DOCUMENT_PROCESSING_SOCKET,env.DOCUMENT_PROCESSING_SOCKET);
 assert.equal(safe.SAAS_LOCAL_ORIGINALS_DIR,undefined);
 assert.equal(safe.VTV_LOCAL_WORKER_DATABASE_URL,undefined);
 assert.equal(safe.SMTP_PASSWORD,undefined);
 assert.equal(safe.WEB_AUTH_OUTBOX_KEY,undefined);
 assert.equal(safe.PROVIDER_SECRET_KEY,undefined);
 assert.equal(safe.SAAS_SUPPLIER_LOGOS_ENABLED,undefined);
 assert.equal(safe.SAAS_SUPPLIER_LOGO_SCHEMA_SHA256,undefined);
 assert.equal(safe.SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256,undefined);
 const worker=childEnv(env,false);
 assert.equal(worker.SAAS_LOCAL_ORIGINALS_DIR,base.SAAS_LOCAL_ORIGINALS_DIR);
 assert.equal(worker.SAAS_SUPPLIER_LOGOS_ENABLED,'1');
 assert.equal(worker.SAAS_SUPPLIER_LOGO_SCHEMA_SHA256,'54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4');
 assert.equal(worker.SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256,'8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087');
});

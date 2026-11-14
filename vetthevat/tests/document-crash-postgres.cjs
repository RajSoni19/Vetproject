// Real database leases and actual process termination. Does not inspect/approve
// clean files, contact providers, drain historical queues or change a schema.
const s=require('./saas-services.cjs'),{fork}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),{jsPDF}=require('jspdf');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
 const target=await s.operator(async db=>(await db.query('SELECT current_database() AS db,inet_server_port() AS port,host(inet_server_addr()) AS host')).rows[0]);s.assert.deepEqual(target,{db:'vtv_saas_dev',port:55440,host:'127.0.0.1'});
 const user=await s.provisionVerifiedTestIdentity('document-crash'),session=await s.sessionForVerifiedTestIdentity(user),company=await s.companyFor(user.userId),business=s.business(),pdf=new jsPDF();pdf.text('Synthetic worker crash drill '+s.crypto.randomUUID(),10,10);const bytes=Buffer.from(pdf.output('arraybuffer'));
 const env={...s.environment(),SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev'},storage=s.loadSource('lib/server/saas/local-originals').localPrivateOriginals(env,s.root),documents=s.loadSource('lib/server/saas/documents').documentWorkflow(business.database,storage);
 let lock,worker,child;
 try{
  const document=await documents.intake({sessionCookie:session.token,companyId:company},{bytes,byteSize:bytes.length,sha256:s.crypto.createHash('sha256').update(bytes).digest('hex'),mimeType:'application/pdf',originalName:'synthetic-crash.pdf'},s.crypto.randomUUID());
  // SKIP LOCKED confines the real claim function to this test's new document.
  // Historical rows are locked, never changed or consumed by this drill.
  lock=new s.Client(s.connection('vtv_saas_operator'));await lock.connect();await lock.query('BEGIN');await lock.query('SELECT id FROM saas.document_jobs WHERE document_id<>$1 FOR UPDATE',[document.id]);
  child=fork(path.join(__dirname,'fixtures/document-lease-process.cjs'),[],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  const lease=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Claim subprocess timeout')),15000);child.once('error',reject);child.once('message',message=>{clearTimeout(timer);message.lease?resolve(message.lease):reject(Error('Lease subprocess refused'));});});s.assert.equal(lease.documentId,document.id);
  const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exited;
  worker=new s.Client(s.connection('vtv_saas_operator'));await worker.connect();await worker.query('SET SESSION AUTHORIZATION vtv_saas_document_worker');const store=s.loadSource('lib/server/saas/worker-store').documentWorkerStore(worker,s.configuration().installationId);
  s.assert.equal(await store.claim('inspect'),null,'An unexpired crashed lease must not be reissued');
  const state=await s.operator(async db=>(await db.query('SELECT attempts,extract(epoch FROM lease_until-now()) AS remaining FROM saas.document_jobs WHERE id=$1',[lease.jobId])).rows[0]);s.assert.equal(state.attempts,1);const waitMs=Math.ceil(Number(state.remaining)*1000)+250;
  console.log('REAL PASS process killed after durable claim; waiting for actual 120-second lease expiry, without editing clocks or leases');await delay(Math.max(waitMs,0));
  const replacement=await store.claim('inspect');s.assert.equal(replacement.jobId,lease.jobId);s.assert.notEqual(replacement.leaseId,lease.leaseId);
  s.assert.equal(await store.finishInspection(lease,{verdict:'error',engine:'synthetic-crash-test',policy:'no-clean-claim'}),false,'Stale worker cannot acknowledge replacement lease');
  s.assert.equal(await store.finishInspection(replacement,{verdict:'error',engine:'synthetic-crash-test',policy:'no-clean-claim'}),true);
  const final=await s.operator(async db=>(await db.query('SELECT q.state,q.attempts,d.state AS document_state FROM saas.document_jobs q JOIN saas.documents d ON d.id=q.document_id WHERE q.id=$1',[lease.jobId])).rows[0]);s.assert.deepEqual(final,{state:'queued',attempts:2,document_state:'quarantined'});
  fs.mkdirSync(path.resolve('.launch-acceptance'),{recursive:true});fs.writeFileSync(path.resolve('.launch-acceptance/document-crash-postgres.json'),JSON.stringify({at:new Date().toISOString(),target:'127.0.0.1:55440/vtv_saas_dev',realProcessKill:true,realLeaseExpiry:true,clockOrLeaseEdited:false,staleAcknowledgementDenied:true,boundedRetry:true,quarantinePreserved:true,historicalQueuesDrained:false,managedWorkerCredentialTested:false,scannerOrProviderAcceptance:false,documentId:document.id},null,2));console.log('REAL PASS expired claim recovered with new lease; stale acknowledgement denied; retry preserves quarantine');
 }finally{child?.kill();if(worker)await worker.end();if(lock){await lock.query('ROLLBACK');await lock.end();}await business.pool.end();}
}
run().catch(()=>{console.error('Document crash acceptance failed; private fixture state preserved for inspection.');process.exitCode=1;});

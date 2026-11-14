const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {assert,crypto,Client,connection,operator,provisionVerifiedTestIdentity,companyFor}=require('./saas-services.cjs');
const {jsPDF}=require('jspdf');
const {createCanvas}=require('@napi-rs/canvas');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function wsl(args){
 const result=spawnSync('wsl.exe',args,{encoding:'utf8',windowsHide:true,timeout:10000});
 if(result.error)throw result.error;
 return result;
}
function workerSocketExists(){
 const result=wsl(['--','bash','-lc','test -S "/run/user/$(id -u)/vtv-document-worker/processing.sock"']);
 return result.status===0;
}
function workerProcessesActive(){
 const result=wsl(['--','bash','-lc',"ps -C node -o args= | grep -Fq '/.release-workers/main.cjs'"]);
 return result.status===0;
}
function removeStaleWorkerSocket(){
 const result=wsl(['--','bash','-lc','socket="/run/user/$(id -u)/vtv-document-worker/processing.sock"; if test -S "$socket"; then unlink "$socket"; fi']);
 assert.equal(result.status,0,'Could not remove the stale local processing socket.');
}
async function waitForWorkers(){
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  if(workerSocketExists()&&workerProcessesActive()){
   await delay(1000);
   return;
  }
  await delay(500);
 }
 throw Error('Timed out waiting for the local WSL processor and both document workers.');
}
async function waitForWorkersToStop(){
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  if(!workerProcessesActive()){removeStaleWorkerSocket();return;}
  await delay(500);
 }
 throw Error('WSL document workers are still running; the old queue remains locked.');
}
async function waitForDocument(id){
 const deadline=Date.now()+180000;
 let latest;
 while(Date.now()<deadline){
  latest=await operator(async db=>(await db.query(`
   SELECT d.state,
    (SELECT i.verdict FROM saas.document_inspections i WHERE i.company_id=d.company_id AND i.document_id=d.id AND i.object_version=d.object_version ORDER BY i.created_at DESC LIMIT 1) AS verdict,
    (SELECT j.state FROM saas.document_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id AND j.kind='inspect' ORDER BY j.created_at DESC LIMIT 1) AS inspection_job,
    (SELECT j.state FROM business.extraction_jobs j WHERE j.company_id=d.company_id AND j.document_id=d.id ORDER BY j.created_at DESC LIMIT 1) AS extraction_job
   FROM saas.documents d WHERE d.id=$1`,[id])).rows[0]);
  if(latest?.state==='clean'&&latest.verdict==='clean'&&latest.extraction_job==='completed')return latest;
  if(latest?.state==='rejected'||latest?.inspection_job==='failed'||latest?.inspection_job==='exhausted'||latest?.extraction_job==='failed'||latest?.extraction_job==='exhausted')throw Error('Document worker failed: '+JSON.stringify(latest));
  await delay(1000);
 }
 throw Error('Document scan/OCR timed out: '+JSON.stringify(latest));
}
async function uploadResponseId(uploadedDocumentId){
 const id=await uploadedDocumentId();
 assert.match(id,/^[0-9a-f-]{36}$/i);
 return id;
}
async function pageRequest(evaluate,path,companyId,method='GET',body){
 const result=await evaluate(`(async()=>{
  const session=await(await fetch('/api/auth/session',{cache:'no-store'})).json();
  const headers={'x-company-id':${JSON.stringify(companyId)}};
  if(${JSON.stringify(method)}!=='GET'){
   headers['content-type']='application/json';
   headers['x-csrf-token']=session.csrfToken;
   headers['idempotency-key']=crypto.randomUUID();
   headers['if-match']='"1"';
  }
  const response=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},headers,body:${body===undefined?'undefined':'JSON.stringify('+JSON.stringify(body)+')'},cache:'no-store'});
  let value;try{value=await response.json();}catch{}
  return {status:response.status,body:value};
 })()`);
 assert.ok(result.status>=200&&result.status<300,`${method} ${path} failed: ${JSON.stringify(result.body)}`);
 return result.body.data;
}

exports.run=async({evaluate,navigate,send,root,until,click,input,upload,uploadedDocumentId})=>{
 assert.equal(workerProcessesActive(),false,'Stop the WSL worker before the isolated queue lock is acquired.');
 removeStaleWorkerSocket();
 const daemon=wsl(['--','bash','-lc','clamdscan --ping 1:3 --no-summary /dev/null && clamdscan --version']);
 assert.equal(daemon.status,0,'ClamAV health check failed: '+daemon.stderr);
 assert.match(daemon.stdout,/PONG/);
 const version=daemon.stdout.match(/\/\d+\/([A-Za-z]{3} [A-Za-z]{3}\s+\d{1,2} [0-9:]+ \d{4})/);
 assert.ok(version,'ClamAV signature timestamp was not reported.');
 const signatureDate=Date.parse(version[1].replace(/\s+/g,' '));
 assert.ok(Number.isFinite(signatureDate)&&Date.now()-signatureDate<24*60*60*1000&&signatureDate<=Date.now(),'ClamAV signatures are stale or have an invalid timestamp.');

 const lock=new Client(connection('vtv_saas_operator'));
 await lock.connect();
 let transaction=false,oldInspectionJobs=[],oldExtractionJobs=[],workerObserved=false,tempFile;
 try{
  await lock.query('BEGIN');transaction=true;
  oldInspectionJobs=(await lock.query("SELECT id::text,state,attempts FROM saas.document_jobs WHERE state='queued' ORDER BY created_at,id FOR UPDATE")).rows;
  oldInspectionJobs.sort((left,right)=>left.id.localeCompare(right.id));
  oldExtractionJobs=(await lock.query("SELECT id::text,state FROM business.extraction_jobs WHERE state='queued' ORDER BY created_at,id FOR UPDATE")).rows;
  assert.equal(oldInspectionJobs.length,86,'The preexisting inspect queue changed; no worker was started.');
  const preFenceJobs=await lock.query("SELECT count(*)::int AS count FROM saas.document_jobs j JOIN saas.documents d ON d.company_id=j.company_id AND d.id=j.document_id JOIN business.local_document_scope fence ON fence.singleton WHERE j.id=ANY($1::uuid[]) AND d.created_at<fence.created_after",[oldInspectionJobs.map(row=>row.id)]);
  assert.equal(preFenceJobs.rows[0].count,86,'A queued inspection job is not protected by the Migration 037 fence.');
  assert.equal(oldExtractionJobs.length,0,'Unexpected preexisting extraction jobs; no worker was started.');

  const account=await provisionVerifiedTestIdentity('document-worker-e2e');
  const companyId=await companyFor(account.userId);
  await operator(db=>db.query("INSERT INTO saas.subscription_entitlements(account_id,plan,status,invoices_per_month,company_limit,seat_limit,history_days,ors_enabled,verified_at,source_reference) SELECT account_id,'Basic','active',30,2,2,90,false,now(),$2 FROM saas.company_profiles WHERE company_id=$1",[companyId,'synthetic-document-worker-e2e-'+crypto.randomUUID()]));

  await navigate('/login','Sign in');
  await input('Email',account.email);
  await input('Password',account.password);
  await click('Sign in');
  await until('location.pathname==="/app/dashboard"&&document.body.innerText.includes("Sign out")','verified document workflow login');
  await navigate('/app/invoices/upload','Select an authorized company');
  await until('Boolean(document.querySelector("#server-company"))','company selector');
  await until(`Boolean([...document.querySelectorAll('#server-company option')].find(option=>option.value===${JSON.stringify(companyId)}))`,'authorized test company');
  await evaluate(`(()=>{const selector=document.querySelector('#server-company');selector.value=${JSON.stringify(companyId)};selector.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until('document.body.innerText.includes("Company selection saved to your secure web session.")','server-confirmed test company');
  await until('Boolean(document.querySelector(\'input[type="file"][accept^="application/pdf"]\'))','PDF upload control');

  console.log('PREEXISTING_QUEUE_LOCKED: 86 pre-fence inspect jobs locked without updates; start the WSL local:workers supervisor now.');
  await waitForWorkers();
  workerObserved=true;
  console.log('WSL_WORKERS_READY: isolated processor and both job consumers are active.');

  const invoiceAlphabet='ACDEFHJKLMNPRT';
  const invoiceNumber='VTV-DOC-WORKER-'+Array.from(crypto.randomBytes(8),byte=>invoiceAlphabet[byte%invoiceAlphabet.length]).join('');
  const fileName=invoiceNumber+'.pdf';
  const rows=[
   'Supplier: VTV Synthetic Supplier',
   'Invoice Number: '+invoiceNumber,
   'Invoice Date: 30/10/2026',
   'Currency: GBP',
   'Net Total: 100.00',
   'VAT: 20.00',
   'Total: 120.00',
   'VTV synthetic line | 1 | 100.00 | 20% | 100.00'
  ];
  const canvas=createCanvas(1500,1500),context=canvas.getContext('2d');
  context.fillStyle='#ffffff';context.fillRect(0,0,1500,1500);context.fillStyle='#111111';context.font='38px Arial';
  rows.forEach((row,index)=>context.fillText(row,70,100+index*100));
  const pdf=new jsPDF();pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,210);
  tempFile=path.join(os.tmpdir(),invoiceNumber+'.pdf');fs.writeFileSync(tempFile,Buffer.from(pdf.output('arraybuffer')));

  await upload(tempFile,'input[type=file][accept^="application/pdf"]');
  try{await until('window.__vtvLastDocumentUpload?.body?.data?.id||document.body.innerText.includes("Original stored in quarantine")||Boolean(document.querySelector("[role=alert]"))','upload request result');}catch(error){throw Error(error.message+': '+JSON.stringify(await evaluate('({response:window.__vtvLastDocumentUpload||null,alert:document.querySelector("[role=alert]")?.innerText||"",body:document.body.innerText.slice(-1200),files:[...document.querySelectorAll(\'input[type="file"]\')].map(input=>({accept:input.accept,aria:input.getAttribute("aria-label"),count:input.files?.length||0}))})')));}
  const uploadDiagnostic=await evaluate('({response:window.__vtvLastDocumentUpload||null,alert:document.querySelector("[role=alert]")?.innerText||"",body:document.body.innerText.slice(-1200)})');
  if(!uploadDiagnostic.response?.body?.data?.id)throw Error('Upload did not return a document ID: '+JSON.stringify(uploadDiagnostic));
  const documentId=await uploadResponseId(uploadedDocumentId);
  const document=await operator(async db=>(await db.query('SELECT id::text,company_id::text,original_name,mime_type,byte_size::text,sha256,object_key,object_version,state FROM saas.documents WHERE id=$1',[documentId])).rows[0]);
  assert.ok(document,'Upload response ID must identify a persisted document record.');
  assert.equal(document.company_id,companyId);
  assert.equal(document.original_name,fileName);
  assert.equal(document.mime_type,'application/pdf');
  assert.ok(['quarantined','clean'].includes(document.state));
  assert.ok(document.object_version&&!document.object_key.startsWith('http'),'Stored metadata points to a private object, not a public URL.');

  const rootPath=path.join(process.env.LOCALAPPDATA,'VetTheVat','private-originals');
  const objectName=crypto.createHash('sha256').update(document.object_key).digest('hex')+'.original';
  const objectPath=path.join(rootPath,objectName);
  assert.equal(fs.existsSync(objectPath),true,'Original must exist before its inspect job is processed.');
  const bytes=fs.readFileSync(objectPath),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(String(bytes.length),document.byte_size);
  assert.equal(sha256,document.sha256);
  const wslPathResult=wsl(['--','wslpath','-a',objectPath]);
  assert.equal(wslPathResult.status,0,'WSL could not resolve the approved Windows storage path.');
  const wslPath=wslPathResult.stdout.trim();
  const quotedWslPath="'"+wslPath.replace(/'/g,"'\\''")+"'";
  const workerRead=wsl(['--','bash','-lc',`sha256sum -- ${quotedWslPath}`]);
  assert.equal(workerRead.status,0,'WSL could not read the stored original: '+workerRead.stderr);
  assert.equal(workerRead.stdout.trim().split(/\s+/)[0],document.sha256,'WSL and Windows must see the exact database-verified bytes.');

  const processing=await waitForDocument(documentId);
  assert.equal(processing.state,'clean');
  assert.equal(processing.verdict,'clean');
  assert.equal(processing.extraction_job,'completed');
  const inspection=await operator(async db=>(await db.query('SELECT verdict,scanner,policy_version FROM saas.document_inspections WHERE company_id=$1 AND document_id=$2 ORDER BY created_at DESC LIMIT 1',[companyId,documentId])).rows[0]);
  assert.equal(inspection.verdict,'clean');
  assert.match(inspection.scanner,/^ClamAV /);
  assert.equal(inspection.policy_version,'vtv-local-bounded-v1');

  await navigate('/app/invoices/upload','Company documents');
  await until(`Boolean([...document.querySelectorAll('article')].find(item=>item.innerText.includes(${JSON.stringify(fileName)})))`,'uploaded document visible for review');
  await evaluate(`(()=>{const row=[...document.querySelectorAll('article')].find(item=>item.innerText.includes(${JSON.stringify(fileName)}));const button=[...row.querySelectorAll('button')].find(item=>item.textContent.trim()==='Review extraction');if(!button)throw new Error('Review extraction action unavailable');button.click();})()`);
  await until('document.body.innerText.includes("OCR suggestions · manual review required")&&document.body.innerText.includes('+JSON.stringify(invoiceNumber)+')','human review shows extracted values');
  const extraction=await pageRequest(evaluate,`/api/business/documents/${documentId}/extraction`,companyId);
  assert.equal(extraction.reviewRequired,true,'OCR must remain gated for human review.');
  assert.equal(extraction.pages.length,1);
  const observations=extraction.pages[0].observations.extraction??extraction.pages[0].observations;
  assert.equal(observations.supplierName,'VTV Synthetic Supplier');
  assert.equal(observations.invoiceNumber,invoiceNumber);
  assert.equal(observations.invoiceDate,'2026-10-30');
  assert.equal(observations.currency,'GBP');
  assert.equal(observations.net,'100.00');
  assert.equal(observations.vat,'20.00');
  assert.equal(observations.gross,'120.00');

  const contact=await pageRequest(evaluate,'/api/business/contacts',companyId,'POST',{kind:'supplier',name:observations.supplierName,status:'active'});
  const invoice=await pageRequest(evaluate,'/api/business/invoices',companyId,'POST',{
   direction:'purchase',kind:'invoice',contactId:contact.id,number:observations.invoiceNumber,issuedOn:observations.invoiceDate,dueOn:null,currency:observations.currency,rounding:'line-half-up',
   lines:[{description:'VTV synthetic line',quantity:'1',unitPrice:'100.00',discount:'0',rate:'20',treatment:'standard',pricing:'exclusive'}],notes:'Labeled synthetic document-worker E2E; fields reviewed against OCR suggestions.',creditForId:null
  });
  const attached=await pageRequest(evaluate,`/api/business/invoices/${invoice.id}/attachments`,companyId,'POST',{documentId});
  assert.equal(attached.state,'clean');
  const saved=await operator(async db=>(await db.query(`
   SELECT i.id::text,i.number,i.state,i.net::text,i.vat::text,i.gross::text,
    (SELECT count(*)::int FROM business.invoice_attachments a WHERE a.company_id=i.company_id AND a.invoice_id=i.id AND a.document_id=$2) AS attached
   FROM business.invoices i WHERE i.company_id=$1 AND i.id=$3`,[companyId,documentId,invoice.id])).rows[0]);
  assert.deepEqual([saved.number,saved.state,saved.net,saved.vat,saved.gross,saved.attached],[invoiceNumber,'draft','100.00','20.00','120.00',1]);
  console.log(JSON.stringify({label:'single labeled synthetic scanned PDF',documentId,invoiceId:invoice.id,storageRoot:'%LOCALAPPDATA%\\VetTheVat\\private-originals',bytes:bytes.length,sha256,windowsAndWslBytesMatch:true,inspection,extraction:observations,invoice:saved}));
  console.log('PASS upload -> durable private original -> WSL byte match -> clean ClamAV inspection -> OCR -> human review -> saved invoice draft');
 }finally{
  if(tempFile&&fs.existsSync(tempFile))fs.unlinkSync(tempFile);
   if(workerObserved||workerProcessesActive()||workerSocketExists()){
   console.log('STOP_WSL_WORKERS_NOW: the existing 86 pre-fence inspect jobs are still locked and unchanged.');
   await waitForWorkersToStop();
  }
   try{
    if(transaction){
     const current=await lock.query("SELECT id::text,state,attempts FROM saas.document_jobs WHERE id=ANY($1::uuid[]) ORDER BY id",[oldInspectionJobs.map(row=>row.id)]);
     const currentById=new Map(current.rows.map(row=>[row.id,row]));
     assert.deepEqual(oldInspectionJobs.map(row=>currentById.get(row.id)).map(row=>[row.id,row.state,row.attempts]),oldInspectionJobs.map(row=>[row.id,row.state,row.attempts]),'Preexisting inspection jobs must remain unchanged.');
     await lock.query('ROLLBACK');transaction=false;
     const after=await operator(async db=>(await db.query("SELECT id::text,state,attempts FROM saas.document_jobs WHERE id=ANY($1::uuid[]) ORDER BY id",[oldInspectionJobs.map(row=>row.id)])).rows);
     assert.deepEqual(after.map(row=>[row.id,row.state,row.attempts]),oldInspectionJobs.map(row=>[row.id,row.state,row.attempts]),'Preexisting jobs remained unchanged after releasing the queue lock.');
     console.log('PASS released the temporary queue lock; all 86 pre-fence jobs retain their state and attempts.');
    }
   }finally{await lock.end();}
  }
};

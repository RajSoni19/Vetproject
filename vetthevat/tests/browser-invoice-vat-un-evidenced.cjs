const s=require('./uat-services.cjs'),{fs,path,assert,crypto}=s,os=require('node:os'),{spawn}=require('node:child_process'),XLSX=require('xlsx'),{ocrReviewDraft}=s.loadSource('lib/ocr-review-draft');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),documentId='016c846e-7d87-45bd-9cf2-334142a1e204',invoiceNumber='INV-000110',supplierName='RK Fruits & Vegetables Limited';
let phase='browser startup';
async function main(){
 const customer=s.credential('Customer'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'vtv-invoice-vat-')),downloads=path.join(profile,'downloads'),certificatePin=crypto.createHash('sha256').update(new crypto.X509Certificate(fs.readFileSync(path.join(s.common.directory,'localhost.crt'))).publicKey.export({type:'spki',format:'der'})).digest('base64');
 fs.mkdirSync(downloads);
 const chrome=spawn(process.env.VET_VAT_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--ignore-certificate-errors-spki-list='+certificatePin,'--disable-gpu','--disable-breakpad','--disable-crash-reporter','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket,session,sequence=0;const waiting=new Map(),exceptions=[],downloadEvents=[],exportResponses=[];
 try{
  let marker;for(let i=0;i<100;i++){try{marker=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);break;}catch{}await delay(100);}assert.ok(marker,'Chrome DevTools endpoint started');
  socket=new WebSocket('ws://127.0.0.1:'+marker[0]+marker[1]);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);if(message.method?.startsWith('Browser.download'))downloadEvents.push({method:message.method,...message.params});if(message.method==='Network.responseReceived'&&message.params.response.url.includes('/api/business/invoices/'))exportResponses.push({status:message.params.response.status,url:message.params.response.url,mime:message.params.response.mimeType});if(waiting.has(message.id)){const pending=waiting.get(message.id);waiting.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(Error(message.error.message)):pending.resolve(message.result);}});
  const send=(method,params={},target=session)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(Error('Browser timeout: '+method));},20000);waiting.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));});
  const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description?.split('\n')[0]??result.exceptionDetails.text);return result.result.value;};
  const until=async(expression,label,limit=180)=>{for(let i=0;i<limit;i++){if(await evaluate('Boolean('+expression+')'))return;await delay(100);}throw Error('Timed out waiting for '+label+': '+await evaluate('JSON.stringify({url:location.href,text:document.body?.innerText?.slice(0,1000),alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent)})'));};
  const navigate=async route=>{await send('Page.navigate',{url:s.origin+route});await until('document.readyState==="complete"','page load');};
  const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field '+${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const submit=async selector=>evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});if(!f)throw Error('Missing form');f.requestSubmit();})()`);
  const signIn=async()=>{await s.resetLoginFixture('Customer');await navigate('/login');await until('document.querySelector("input[name=email]")','login form');await fill('[name=email]',customer.email);await fill('[name=password]',customer.password);await submit('form');await until('location.pathname==="/app/dashboard"','customer login');await until(`document.querySelector('#server-company option[value="${customer.companyId}"]')`,'customer company option');await fill('#server-company',customer.companyId);};
  phase='customer authentication';await signIn();
  const apiSession=await s.login('Customer'),extraction=await s.request('/api/business/documents/'+documentId+'/extraction',{session:apiSession,headers:{'x-company-id':customer.companyId}});
  assert.equal(extraction.status,200,'Authorized OCR extraction is available for comparison');
  const sourceLines=ocrReviewDraft(extraction.body.data.pages??[]).lines;
  assert.equal(sourceLines.length,12,'Stored OCR source has all 12 fixture lines');
  assert.equal(Math.round(sourceLines.reduce((sum,line)=>sum+Number(line.quantity)*Number(line.unitPrice),0)*100),21250,'Stored OCR lines reconcile to £212.50');
  const persisted=await s.operator(async db=>{
   const fixture=(await db.query("SELECT d.state,j.state AS extraction,(SELECT count(*) FROM business.invoice_attachments a WHERE a.company_id=d.company_id AND a.document_id=d.id)::int AS attached FROM saas.documents d LEFT JOIN business.extraction_jobs j ON j.company_id=d.company_id AND j.document_id=d.id WHERE d.company_id=$1 AND d.id=$2",[customer.companyId,documentId])).rows[0];
   const invoices=(await db.query("SELECT id::text,state,contact_id::text FROM business.invoices WHERE company_id=$1 AND upper(number)=upper($2)",[customer.companyId,invoiceNumber])).rows;
   return {fixture,invoices};
  });
  assert.deepEqual({state:persisted.fixture.state,extraction:persisted.fixture.extraction},{state:'clean',extraction:'completed'});
  assert.ok(persisted.invoices.length<=1,'Fixture invoice is unique within the authorized company');
  assert.equal(persisted.fixture.attached,persisted.invoices.length,'The original is unattached before saving and remains attached afterward');
  if(persisted.invoices.length)assert.equal(persisted.invoices[0].state,'draft','The saved fixture remains a draft');
  let invoiceId=persisted.invoices[0]?.id;
  if(!invoiceId){
   phase='OCR review form';
   await navigate('/app/invoices/new?documentId='+documentId);
   await until('document.body.innerText.includes("Review Extracted Invoice")','structured OCR review form');
   await until('document.querySelectorAll("fieldset").length===12','all 12 extracted line items');
   const extracted=await evaluate(`(()=>({heading:[...document.querySelectorAll('h2')].map(e=>e.textContent).find(x=>x==='Review Extracted Invoice'),supplier:document.body.innerText.includes(${JSON.stringify(supplierName)}),number:document.querySelector('[name=number]')?.value,issuedOn:document.querySelector('[name=issuedOn]')?.value,dueOn:document.querySelector('[name=dueOn]')?.value,currency:document.querySelector('[name=currency]')?.value,lines:[...document.querySelectorAll('fieldset')].map(f=>{const i=[...f.querySelectorAll('input')];return {description:i[0]?.value,quantity:i[1]?.value,unitPrice:i[2]?.value,discount:i[3]?.value,rate:i[4]?.value,treatment:f.querySelector('select')?.value}}),warning:document.body.innerText.includes('VAT not evidenced — pending review')}))()`);
   assert.equal(extracted.heading,'Review Extracted Invoice');assert.ok(extracted.supplier,'Supplier proposal matches OCR evidence');assert.equal(extracted.number,invoiceNumber);assert.equal(extracted.issuedOn,'2026-10-26');assert.equal(extracted.dueOn,'2026-10-26');assert.equal(extracted.currency,'GBP');assert.equal(extracted.lines.length,12);assert.ok(extracted.warning,'Missing VAT is flagged for review');
   assert.deepEqual(extracted.lines.map(({description,quantity,unitPrice})=>({description,quantity:Number(quantity),unitPrice:Number(unitPrice)})),sourceLines.map(({description,quantity,unitPrice})=>({description,quantity:Number(quantity),unitPrice:Number(unitPrice)})),'Browser rows match stored OCR extraction');
   assert.ok(extracted.lines.every(line=>line.description&&Number(line.quantity)>0&&Number(line.unitPrice)>0&&line.rate===''&&line.treatment==='not-evidenced'),'Every line has source values and no inferred VAT rate');
   const cents=extracted.lines.reduce((sum,line)=>sum+Math.round(Number(line.quantity)*Number(line.unitPrice)*100)-Math.round(Number(line.discount||0)*100),0);   assert.equal(cents,21250,'Extracted line totals reconcile to £212.50');
   const hasSupplier=await evaluate(`([...document.querySelectorAll('[name=contactId] option')].filter(o=>o.textContent.trim()===${JSON.stringify(supplierName)}).length)`);
   if(!hasSupplier){await navigate('/app/suppliers/new');await until('document.querySelector("input[name=name]")','new supplier form');await fill('[name=name]',supplierName);await submit('form');await until('document.body.innerText.includes("Contact saved to the company database.")','supplier saved from invoice evidence');}
   await navigate('/app/invoices/new?documentId='+documentId);await until('document.querySelectorAll("fieldset").length===12','reloaded OCR lines');await until('document.querySelector("[name=contactId]")?.value!==""','supplier selected after review');
   const selected=await evaluate(`(()=>{const s=document.querySelector('[name=contactId]');return {name:s.selectedOptions[0]?.textContent.trim(),matches:[...s.options].filter(o=>o.textContent.trim()===${JSON.stringify(supplierName)}).length}})()`);
   assert.deepEqual(selected,{name:supplierName,matches:1},'Exactly one company supplier matches the reviewed evidence');
   await submit('form');
   await until('location.pathname.startsWith("/app/invoices/")&&location.pathname.split("/").length===4&&document.body.innerText.includes("Confirm reviewed invoice")','draft invoice saved');
   invoiceId=await evaluate('location.pathname.split("/").pop()');
  }else{
   const fixtureLink=(await s.operator(async db=>(await db.query('SELECT count(*)::int AS n FROM business.invoice_attachments WHERE company_id=$1 AND invoice_id=$2 AND document_id=$3',[customer.companyId,invoiceId,documentId])).rows[0])).n;
   assert.equal(fixtureLink,1,'Previously saved invoice retains the original PDF');
   await navigate('/app/invoices/'+invoiceId);
  }
  phase='invoice detail and persistence';await until('document.body.innerText.includes("Payment tracking")','payment status panel');await until('document.body.innerText.includes("Not applicable")','draft payment state');
  const detail=await evaluate('JSON.stringify({rows:document.querySelectorAll("table tbody tr").length,buttons:[...document.querySelectorAll("button")].map(b=>b.textContent.trim()),body:document.body.innerText})');
  const detailState=JSON.parse(detail);assert.equal(detailState.rows,12,'Saved invoice detail shows 12 lines');assert.ok(detailState.buttons.some(text=>text.includes('XLSX')),'Invoice detail offers XLSX export');assert.ok(detailState.buttons.some(text=>text.includes('PDF')),'Existing PDF export remains available');
  phase='XLSX download and content verification';await send('Page.reload');await until('document.body.innerText.includes("Payment tracking")','reloaded invoice detail');await until('document.querySelectorAll("table tbody tr").length===12','saved lines after refresh');await until('document.body.innerText.includes("Not applicable")','payment state after refresh');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true},null);
  await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('XLSX'));if(!b)throw Error('XLSX button unavailable');b.click();})()`);
  for(let i=0;i<100&&!fs.readdirSync(downloads).some(file=>file.endsWith('.xlsx')&&fs.statSync(path.join(downloads,file)).isFile());i++)await delay(100);
  const workbookName=fs.readdirSync(downloads).find(file=>file.endsWith('.xlsx')&&fs.statSync(path.join(downloads,file)).isFile());
  assert.ok(workbookName,'Browser download produced a file: '+JSON.stringify({entries:fs.readdirSync(downloads).map(file=>({name:file,size:fs.statSync(path.join(downloads,file)).size,isFile:fs.statSync(path.join(downloads,file)).isFile()})),events:downloadEvents,responses:exportResponses,body:(await evaluate('document.body.innerText')).slice(-800)}));const workbookPath=path.join(downloads,workbookName),workbook=XLSX.readFile(workbookPath),summary=XLSX.utils.sheet_to_json(workbook.Sheets['Invoice Summary'],{header:1}),items=XLSX.utils.sheet_to_json(workbook.Sheets['Invoice Line Items'],{header:1});
  assert.equal(summary.length,2);assert.equal(summary[1][0],invoiceNumber);assert.equal(summary[1][1],supplierName);assert.equal(summary[1][6],'2026-10-26');assert.equal(summary[1][7],'2026-10-26');assert.equal(Number(summary[1][8]),212.5);assert.equal(summary[1][9],'');assert.match(String(summary[1][10]),/not-evidenced/i);assert.equal(summary[1][11],'review-required');assert.equal(Number(summary[1][13]),212.5);assert.equal(summary[1][14],'not-applicable');assert.equal(summary[1][16],'');assert.equal(summary[1][17],'');assert.ok(String(summary[1][18]).includes(documentId));
  assert.equal(items.length,13,'XLSX contains one header and all 12 extracted items');
  const exported=items.slice(1).map(row=>({description:String(row[4]),quantity:Number(row[5]),unitPrice:Number(row[6]),rate:row[9],lineVat:row[12],total:Number(row[13])}));
  assert.deepEqual(exported.map(({description,quantity,unitPrice})=>({description,quantity,unitPrice})),sourceLines.map(line=>({description:line.description,quantity:Number(line.quantity),unitPrice:Number(line.unitPrice)})));
  assert.ok(exported.every(line=>line.rate===''&&line.lineVat===''),'XLSX leaves unsupported VAT rate and amount blank');
  assert.equal(Math.round(exported.reduce((sum,line)=>sum+line.total,0)*100),21250);
  const row=await s.operator(async db=>(await db.query(`SELECT i.state,i.number,i.gross::text,i.contact_id::text,t.detection_status,t.detected_vat::text,t.evidenced_vat::text,t.claim_status,t.tax_treatment,
    (SELECT count(*)::int FROM business.invoice_lines l WHERE l.company_id=i.company_id AND l.invoice_id=i.id) line_count,
    (SELECT count(*)::int FROM business.invoice_attachments a WHERE a.company_id=i.company_id AND a.invoice_id=i.id AND a.document_id=$3) attachment_count,
    (SELECT count(*)::int FROM business.invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id) payment_count
    FROM business.invoices i JOIN business.invoice_tax_reviews t ON t.company_id=i.company_id AND t.invoice_id=i.id WHERE i.company_id=$1 AND i.id=$2`,[customer.companyId,invoiceId,documentId])).rows[0]);
  assert.deepEqual({state:row.state,number:row.number,gross:Number(row.gross),detection:row.detection_status,evidencedVat:row.evidenced_vat,claimStatus:row.claim_status,treatment:row.tax_treatment,lineCount:row.line_count,attachmentCount:row.attachment_count,paymentCount:row.payment_count},{state:'draft',number:invoiceNumber,gross:212.5,detection:'not-evidenced',evidencedVat:null,claimStatus:'review-required',treatment:'unknown',lineCount:12,attachmentCount:1,paymentCount:0});
  phase='duplicate rejection';await navigate('/app/invoices/new?documentId='+documentId);await until('document.querySelectorAll("fieldset").length===12','duplicate review form');
  await until('document.querySelector("[name=contactId]")?.value!==""','duplicate supplier selection');await submit('form');await until('!!document.querySelector("[role=alert]")','duplicate invoice rejected');
  const duplicateCount=await s.operator(async db=>Number((await db.query("SELECT count(*) FROM business.invoices WHERE company_id=$1 AND upper(number)=upper($2)",[customer.companyId,invoiceNumber])).rows[0].count));
  assert.equal(duplicateCount,1,'Duplicate invoice review did not create a second record');
  assert.deepEqual(exceptions,[],'Browser completed without uncaught JavaScript exceptions');
  console.log(JSON.stringify({browser:'Headless Chrome against live local UAT',accountRole:'Customer',invoiceId,documentId,supplier:supplierName,lines:12,gross:'212.50 GBP',vat:'not evidenced; no claimable VAT',paymentStatus:'not applicable while draft; no payment invented',xlsxSheets:workbook.SheetNames,xlsxLineItems:items.length-1,duplicateProtection:'second draft rejected; one invoice remains',persistenceAfterRefresh:'passed',browserExceptions:exceptions.length},null,2));
 }finally{
  try{socket?.close();}catch{}try{chrome.kill();}catch{}try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
 }
}
main().catch(error=>{console.error('FAIL '+phase+': '+error.message);if(error.stack)console.error(error.stack);process.exitCode=1;});

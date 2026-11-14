// Optional end-to-end check using installed Chrome and the production build.
// Uses a new temporary profile and synthetic files; never opens the user's profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { jsPDF } = require('jspdf');
const { createCanvas } = require('@napi-rs/canvas');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = 3197;
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vet-vat-synthetic-'));
const chromePath = process.env.VET_VAT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let server, chrome, socket;
const waiting = new Map();
let sequence = 0, session;
const exceptions = [];
let lastNavigatedRoute='about:blank';
let acceptDialog = true;
const dialogs = [];
const protocolListeners = new Set();
function onProtocol(listener) { protocolListeners.add(listener); return () => protocolListeners.delete(listener); }

function send(method, params = {}, target = session) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeoutError = new Error('CDP timeout: ' + method);
    const timer = setTimeout(() => { waiting.delete(id); reject(timeoutError); }, 20000);
    waiting.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
  });
}
async function evaluate(expression) {
  let reply;try{reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });}catch(error){throw Error(String(error?.message||error)+'; expression='+expression.slice(0,180));}
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
  return reply.result.value;
}
async function until(expression, label, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await delay(250); }
  throw new Error('Timed out: ' + label);
}
async function trackDocumentUpload() {
  await evaluate(`(() => {
    if (window.__vtvDocumentUploadHook) return;
    window.__vtvDocumentUploadHook = true;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/api/business/documents') && String(args[1]?.method || 'GET').toUpperCase() === 'POST') {
        window.__vtvLastDocumentUpload = { status: response.status, body: await response.clone().json().catch(() => null) };
      }
      return response;
    };
  })()`);
}
async function navigate(route, text) {
  lastNavigatedRoute=route;
  await send('Page.navigate', { url: (process.env.VTV_BROWSER_LOCAL_ENTRY==='1'?'http://localhost:3000':process.argv.includes('--pg-auth-only')?(process.env.VTV_BROWSER_SAAS==='1'?'https://localhost:3444':'https://localhost:3443'):'http://127.0.0.1:' + port) + route });
  const expectedPath=route.split('?')[0];
  try{await until('location.pathname==='+JSON.stringify(expectedPath)+' && document.body && document.body.innerText.includes(' + JSON.stringify(text) + ')', text+' at '+expectedPath);}catch(error){throw Error(`${error.message}; location=${await evaluate('location.href')}; body=${String(await evaluate('document.body?.innerText||""')).slice(0,1800)}`);}
  await delay(400);
  await trackDocumentUpload();
}
async function click(text) {
  await evaluate(`(() => { const element=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}||item.getAttribute('aria-label')===${JSON.stringify(text)}); if(!element || element.disabled) throw new Error('Missing/enabled button '+${JSON.stringify(text)}+'; visible='+[...document.querySelectorAll('button')].map(b=>b.textContent.trim()+(b.disabled?' [disabled]':'')).join(' | ')); element.focus(); element.click(); })()`);
  await delay(200);
}
async function input(label, value) {
  await evaluate(`(() => { const inputs=[...document.querySelectorAll('input')]; const exact=inputs.find(item=>item.getAttribute('aria-label')===${JSON.stringify(label)}); const element=exact || [...document.querySelectorAll('label')].find(item=>item.firstChild?.textContent.trim()===${JSON.stringify(label)})?.querySelector('input') || inputs.find(item=>item.name.toLowerCase()===${JSON.stringify(label.toLowerCase())}); if(!element) throw new Error('Missing input; fields='+JSON.stringify(inputs.map(item=>({name:item.name,label:item.getAttribute('aria-label'),disabled:item.disabled})))+'; labels='+JSON.stringify([...document.querySelectorAll('label')].map(item=>item.textContent.trim()))); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await delay(80);
}
async function select(label, value) {
  await evaluate(`(() => { const element=document.querySelector('select[aria-label="'+${JSON.stringify(label)}+'"]'); if(!element) throw new Error('Missing select'); element.value=${JSON.stringify(value)}; element.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await delay(200);
}
async function upload(file, selector = 'input[type=file]') {
  await trackDocumentUpload();
  const doc = await send('DOM.getDocument');
  const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [file] });
  await delay(250);
}
async function uploadedDocumentId() {
  await until('window.__vtvLastDocumentUpload?.body?.data?.id', 'document upload response ID');
  const upload = await evaluate('window.__vtvLastDocumentUpload');
  assert.ok(upload.status >= 200 && upload.status < 300, 'Document upload API returned a failure: ' + JSON.stringify(upload));
  assert.match(upload.body.data.id, /^[0-9a-f-]{36}$/i, 'Document ID comes from the upload response');
  return upload.body.data.id;
}

async function launchTestChrome() {
  const marker=path.join(temp,'profile','DevToolsActivePort');
  if(fs.existsSync(marker))fs.unlinkSync(marker);
  const certificateArgs=process.argv.includes('--pg-auth-only')?['--ignore-certificate-errors-spki-list='+require('node:crypto').createHash('sha256').update(new (require('node:crypto').X509Certificate)(fs.readFileSync(process.env.VTV_BROWSER_SAAS==='1'?path.join(require('../scripts/saas-dev-common.cjs').directory,'localhost.crt'):path.join(root,'.auth-pg/localhost.crt'))).publicKey.export({type:'spki',format:'der'})).digest('base64')]:[];
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu',...certificateArgs, '--remote-debugging-port=0', '--user-data-dir=' + path.join(temp, 'profile'), '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const debugFile = path.join(temp, 'profile', 'DevToolsActivePort');
  let debugPort, endpoint;
  for (let index = 0; index < 100; index++) {
    try {
      const values = fs.readFileSync(debugFile, 'utf8').trim().split(/\r?\n/);
      if (/^\d+$/.test(values[0]) && values[1]?.startsWith('/devtools/')) { [debugPort,endpoint] = values; break; }
    } catch(error) { if(!['ENOENT','EBUSY','EACCES'].includes(error.code))throw error; }
    await delay(100);
  }
  assert.ok(debugPort && endpoint, 'Headless Chrome did not publish a readable debug endpoint');
  socket = new WebSocket('ws://127.0.0.1:' + debugPort + endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) { const item = waiting.get(message.id); waiting.delete(message.id); clearTimeout(item.timer); if (message.error) item.reject(new Error(item.method+': '+message.error.message)); else item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(JSON.stringify({route:lastNavigatedRoute,text:message.params.exceptionDetails.text,description:message.params.exceptionDetails.exception?.description,url:message.params.exceptionDetails.url,line:message.params.exceptionDetails.lineNumber,column:message.params.exceptionDetails.columnNumber,stack:message.params.exceptionDetails.stackTrace?.callFrames?.slice(0,4)}));
    if (message.method === 'Page.javascriptDialogOpening') { dialogs.push(message.params); void send('Page.handleJavaScriptDialog', {accept:acceptDialog}).catch(() => undefined); }
    if (message.method) for (const listener of protocolListeners) listener(message);
  });
  const target = await send('Target.createTarget', { url: 'about:blank' }, null);
  const attached = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, null);
  session = attached.sessionId;
  await send('Runtime.enable'); await send('Page.enable');
}
async function restartTestChrome() {
  const previous=chrome;
  if(socket?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}socket.close();}
  if(previous&&previous.exitCode===null){await Promise.race([new Promise(resolve=>previous.once('exit',resolve)),delay(5000)]);if(previous.exitCode===null)previous.kill();}
  for(const item of waiting.values())clearTimeout(item.timer);waiting.clear();session=undefined;
  await launchTestChrome();
}

async function startTestServer(overrides = {}) {
  if(process.argv.includes('--pg-auth-only')){assert.equal((await require(process.env.VTV_BROWSER_SAAS==='1'?'./saas-services.cjs':'./pg-auth-services.cjs').application('/login')).status,200,'Start the isolated HTTPS server first');return;}
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true, env: {...process.env,WEB_AUTH_ENABLED:'0',...(process.argv.includes('--leads-only')||process.argv.includes('--routing-only')?{LEADS_ENABLED:'0',LEADS_EMAIL_DELIVERY_APPROVED:'0',VETTHEVAT_MARKETING_ONLY:'0'}:{}),...overrides} });
  let ready = false;
  for (let index = 0; index < 100; index++) { try { ready = (await fetch('http://127.0.0.1:' + port)).ok; } catch {} if (ready) break; await delay(200); }
  assert.ok(ready, 'Local production server did not start');
}
async function restartTestServer(overrides) {
  const previous=server;previous?.kill();
  if(previous&&previous.exitCode===null)await Promise.race([new Promise(resolve=>previous.once('exit',resolve)),delay(5000)]);
  await startTestServer(overrides);
}
async function run() {
  assert.ok(fs.existsSync(chromePath), 'Installed Chrome required');
  assert.ok(fs.existsSync(path.join(root, '.next', 'BUILD_ID')), 'Run npm run build first');
  await startTestServer();
  await launchTestChrome();

    if(process.argv.includes('--pg-auth-only')){
    if(process.argv.includes('--redesign-only'))await require('./browser-redesign-workflow.cjs').run({evaluate,navigate,send,root,until,click,input,delay,upload,uploadedDocumentId});
    else if(process.argv.includes('--shopping-only'))await require('./browser-grocery-workflow.cjs').run({evaluate,navigate,send,root,until,click,input,delay});
    else if(process.argv.includes('--ors-only'))await require('./browser-ors-workflows.cjs').run({evaluate,navigate,send,root,until,click,input,delay});
    else if(process.argv.includes('--team-only'))await require('./browser-team-workflows.cjs').run({evaluate,navigate,send,root,until,click,input,delay});
    else if(process.argv.includes('--camera-only'))await require('./browser-camera-workflow.cjs').run({evaluate,navigate,send,root,until,click,input,delay});
    else if(process.argv.includes('--launch-only'))await require('./browser-launch-workflows.cjs').run({evaluate,navigate,send,root,until,click,input,delay,uploadedDocumentId});
    else if(process.argv.includes('--trial-only'))await require('./browser-trial-workflow.cjs').run({evaluate,navigate,send,until,click,input,select,delay,temp});
    else if(process.argv.includes('--document-worker-only'))await require('./browser-document-worker-workflow.cjs').run({evaluate,navigate,send,root,until,click,input,delay,upload,uploadedDocumentId});
    else if(process.argv.includes('--banking-only'))await require('./browser-banking-workflows.cjs').run({evaluate,navigate,send,until,click,input,delay});
    else await require(process.env.VTV_BROWSER_SAAS==='1'?'./browser-saas-flow.cjs':'./browser-pg-auth-flow.cjs').run({evaluate,navigate,send,root,until,click,input,delay});
    assert.equal(exceptions.length,0,`Uncaught PostgreSQL browser exceptions: ${exceptions.join(' | ')}`);return;
  }

  if(process.argv.includes('--routing-only')){
    await require('./browser-auth-restoration.cjs').run({evaluate,navigate,send,port,root,until,restartTestServer});
    assert.equal(exceptions.length,0,'Uncaught routing/auth browser exceptions');return;
  }

  if(process.argv.includes('--leads-only')){
    await require('./browser-leads.cjs').run({evaluate,navigate,send,port,root,until,delay,click,onProtocol,restartTestServer});
    assert.equal(exceptions.length,0,'Uncaught lead form exceptions');return;
  }
  if(process.argv.includes('--cleanup-only')){
    await require('./browser-permanent-cleanup.cjs').run({evaluate,navigate,send,port,root,temp,restartTestChrome});
    assert.equal(exceptions.length,0,'Uncaught cleanup regression exceptions');return;
  }
  if(process.argv.includes('--stage1-boundary-only')){
    await require('./browser-stage1-boundary.cjs').run({evaluate,navigate,send,port,root});
    assert.equal(exceptions.length,0,'Uncaught Stage 1 boundary exceptions');return;
  }
  if(process.argv.includes('--admin-auth-only')){
    await require('./browser-admin-auth.cjs').run({evaluate,navigate,click,until,send,root,temp,port});
    assert.equal(exceptions.length,0,'Uncaught authentication boundary exceptions');return;
  }
  const boundary=await fetch('http://127.0.0.1:'+port+'/app/dashboard',{redirect:'manual'});
  if(boundary.status===307&&boundary.headers.get('location')?.includes('/login'))throw new Error('Workspace workflow regressions are blocked by the secure authentication setup gate. No approved test identity/provider is configured; no demo bypass is permitted. Run --admin-auth-only for current boundary checks.');
  await navigate('/app', 'Create your company workspace');
  assert.equal(await evaluate('document.body.innerText.includes("Demo Business Ltd")'),false);
  assert.ok(await evaluate(`(()=>{const state=JSON.parse(localStorage.getItem('vet-the-vat-workspace-v1'));if(state===null)return true;return ['companies','invoices','documents','suppliers','customers','tickets','auditLog','notifications','teamMembers'].every(key=>Array.isArray(state[key])&&state[key].length===0)&&['accounts','transactions','allocations','events'].every(key=>state.bank[key].length===0);})()`),'Fresh profile has zero business records in every collection');
  if(process.argv.includes('--milestone3f-only')){
    await require('./browser-legacy-review.cjs').run({evaluate,navigate,click,input,until,send,root,temp});
    assert.equal(exceptions.length,0,'Uncaught 3F browser exceptions');return;
  }
  if(process.argv.includes('--corrections-only')){
    await require('./browser-corrections.cjs').run({evaluate,navigate,click,input,until,send,root});
    assert.equal(exceptions.length,0,'Uncaught correction browser exceptions');return;
  }
  if(process.argv.includes('--cleanup-only')){
    const {loadSource}=require('./load-source.cjs');
    const demo=loadSource('tests/fixtures/legacy-workspace');
    const legacy=loadSource('lib/workspace').restoreWorkspace(JSON.stringify({invoices:demo.invoices,documents:demo.documents}),{...demo,selectedCompanyId:demo.companies[0].id,settings:{}});
    const raw=JSON.stringify(legacy);
    await evaluate(`localStorage.setItem('vet-the-vat-workspace-v1',${JSON.stringify(raw)})`);
    await navigate('/app','Create your company workspace');
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.length'),0);
    assert.equal(await evaluate('localStorage.getItem("vet-the-vat-before-demo-cleanup-v1")'),raw);
    assert.equal(exceptions.length,0);
    console.log('PASS existing sample workspace cleaned on reload with exact browser-local recovery copy');return;
  }
  await click('Add your company');await input('Company name','Synthetic First Company');await click('Save locally');
  await until('document.body.innerText.includes("Synthetic First Company")','first company created');
  await navigate('/app/dashboard','Synthetic First Company');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.length'),0);
  console.log('PASS empty first run, company creation and reload without sample invoices');
  if(process.argv.includes('--dashboard-clean-only')){
    assert.equal(await evaluate('document.body.innerText.includes("demo seed records")||document.body.innerText.includes("Local / demo data")'),false);
    assert.equal(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).suppliers.length'),0);
    await navigate('/','VAT calculator');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Net amount"]').value`), '');
    assert.ok(await evaluate('document.body.innerText.includes("0 of 5 checks selected")'));
    assert.equal(await evaluate('document.body.innerText.includes("Demo Business Ltd")||document.body.innerText.includes("4,280")'),false);
    await input('Net amount','100');
    await until('document.body.innerText.includes("£20.00")','calculator uses actual entered amount');
    assert.equal(exceptions.length,0);
    console.log('PASS dashboard has no seeded records/stale demo labels; public calculator starts blank and checklist unchecked; entered amounts still calculate');return;
  }
  if(process.argv.includes('--empty-only'))return;
  // Explicit isolated TEST fixtures preserve historical cross-company regression
  // identifiers. Application startup no longer creates these or any sample data.
  const fixtureCompany=(id,name)=>({id,name,registrationNumber:'',vatNumber:'',address:'',country:'United Kingdom',currency:'GBP',industry:'',status:'Active'});
  const fixture={companies:[fixtureCompany('company-demo-business','Demo Business Ltd'),fixtureCompany('company-retail','Demo Retail Group')],invoices:[],documents:[],suppliers:[],tickets:[],auditLog:[],notifications:[],teamMembers:[],selectedCompanyId:'company-demo-business',settings:{},bank:{accounts:[],transactions:[],allocations:[],events:[]}};
  await evaluate(`localStorage.setItem('vet-the-vat-workspace-v1',${JSON.stringify(JSON.stringify(fixture))})`);
  await navigate('/app/invoices/new', 'Invoice details');
  if(process.argv.includes('--release-frontend-only')){
    await require('./browser-release-frontend.cjs').run({evaluate,navigate,click,input,select,until,send,delay,temp});
    assert.equal(exceptions.length,0,'Uncaught release frontend exceptions');return;
  }
  await input('Supplier name', 'Synthetic Supplier'); await input('Invoice number', 'BROWSER-TEST-123');
  await input('Invoice date', '2026-10-14'); await input('Due date (optional)', '2026-11-14');
  await input('Line 1 description', 'Synthetic item'); await input('Line 1 unitPrice', '100'); await input('Line 1 vatRate', '20');
  await click('Save Draft');
  await until('location.pathname.includes("/app/invoices/") && !location.pathname.endsWith("/new")', 'draft navigation');
  const detailRoute = await evaluate('location.pathname');
  await navigate(detailRoute, 'BROWSER-TEST-123');
  await click('Edit'); await until('document.body.innerText.includes("Invoice details")', 'editor reopened');
  await input('Line 1 unitPrice', '120'); await click('Confirm & Save Invoice');
  await until('document.body.innerText.includes("Review & Confirm")', 'confirmed detail');
  const saved = await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.filter(item=>item.invoiceNumber==="BROWSER-TEST-123")');
  assert.equal(saved.length, 1); assert.equal(saved[0].totalAmount, 144); assert.equal(saved[0].status, 'Reviewed');
  console.log('PASS manual draft -> refresh -> edit -> confirmation; one record, reconciled totals');
  if(process.argv.includes('--supplier-only')) {
    await require('./browser-supplier-autolink.cjs').run({evaluate,navigate,click,input,until});
    assert.equal(exceptions.length,0,'Supplier workflow browser exceptions'); return;
  }
  if(process.argv.includes('--frontend-batch2-only')) {
    await require('./browser-frontend-batch2.cjs').run({evaluate,navigate,click,input,send,delay,temp});
    assert.equal(exceptions.length,0,'Frontend batch2 browser exceptions'); return;
  }
  if(process.argv.includes('--frontend-only')) {
    await require('./browser-frontend-phase.cjs').run({evaluate,navigate,click,input,select,until,send,delay,temp});
    assert.equal(exceptions.length,0,'Frontend phase browser exceptions');
    return;
  }
  if(process.argv.includes('--classification-only')) {
    await require('./browser-classification-flows.cjs').run({evaluate,navigate,click,input,select,until,upload,send,delay,temp});
    assert.equal(exceptions.length,0,'Browser runtime exceptions');return;
  }

  if(process.argv.includes('--milestone1-only')) {
    await require('./browser-milestone1-flows.cjs').run({evaluate,navigate,click,input,select,until,send,delay,temp,detailRoute,dialogs,setDialogAcceptance:(value)=>{acceptDialog=value;}});
    assert.equal(exceptions.length,0,'Browser runtime exceptions: '+exceptions.join('; '));
    console.log('PASS isolated Milestone 1 suite with no uncaught page exceptions');
    return;
  }

  await navigate('/app/invoices', 'Invoices');
  await input('From date', '2027-01-01'); await until('document.body.innerText.includes("No invoices found")', 'date filtering');
  await navigate('/app/invoices/not-a-real-id', 'Invoice not found');
  await navigate(detailRoute, 'BROWSER-TEST-123');
  await evaluate(`(() => { const select=document.querySelector('header select'); select.value='company-retail'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await until('document.body.innerText.includes("Invoice not found")', 'company isolation');
  await evaluate(`(() => { const select=document.querySelector('header select'); select.value='company-demo-business'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  console.log('PASS date filter, missing identifier and selected-company detail scope');

  const rows = ['Supplier: Synthetic Supplier', 'Invoice Number: OCR-TEST-789', 'Invoice Date: 14/10/2026', 'Due Date: 14/11/2026', 'Currency: GBP', 'Synthetic item 1 100.00 20% 100.00', 'Subtotal: 100.00', 'VAT: 20.00', 'Total: 120.00'];
  const canvas = createCanvas(1500, 1500), context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 1500, 1500); context.fillStyle = 'black'; context.font = '38px Arial';
  rows.forEach((row, index) => context.fillText(row, 50, 100 + index * 80));
  const digital = new jsPDF(); digital.setFontSize(14); rows.forEach((row, index) => digital.text(row, 15, 25 + index * 15));
  const scanned = new jsPDF(); scanned.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 210);
  const fixtures = [['digital.pdf', Buffer.from(digital.output('arraybuffer'))], ['scanned.pdf', Buffer.from(scanned.output('arraybuffer'))], ['invoice.png', canvas.toBuffer('image/png')], ['invoice.jpg', canvas.toBuffer('image/jpeg')], ['invoice.jpeg', canvas.toBuffer('image/jpeg')]];
  for (const [name, bytes] of fixtures) {
    const file = path.join(temp, name); fs.writeFileSync(file, bytes);
    await navigate('/app/invoices/upload', 'Upload a supplier invoice'); await upload(file);
    await until('document.body.innerText.includes("Text extraction finished") || document.querySelector("[role=alert]")', name + ' extraction', 130000);
    const problem = await evaluate('document.querySelector("[role=alert]")?.textContent || ""');
    assert.equal(problem, '', name + ' extraction error: ' + problem);
    await click('Process Document'); await until('document.body.innerText.includes("Review extracted invoice")', name + ' review');
    const fields = await evaluate(`Object.fromEntries([...document.querySelectorAll('label')].filter(item=>item.querySelector('input')).map(item=>[item.firstChild?.textContent.trim(),item.querySelector('input').value]))`);
    assert.equal(fields['Supplier name'], 'Synthetic Supplier', name + ' supplier');
    assert.equal(fields['Invoice number'], 'OCR-TEST-789', name + ' number');
    assert.equal(fields['Invoice date'], '2026-10-14', name + ' date');
    assert.equal(Number(fields['Net amount']), 100, name + ' net');
    assert.equal(Number(fields['VAT amount']), 20, name + ' VAT');
    assert.equal(Number(fields['Gross total']), 120, name + ' gross');
    await until('Boolean(document.querySelector("iframe[src^=blob], img[src^=blob]"))', name + ' original preview');
    if (name === 'digital.pdf') {
      await evaluate(`[...document.querySelectorAll('label')].find(item=>item.textContent.includes('I have compared the fields')).querySelector('input').click()`);
      await click('Confirm & Save Invoice');
      await until('location.pathname.includes("/app/invoices/") && !location.pathname.endsWith("/upload")', 'extracted invoice save');
      const route = await evaluate('location.pathname');
      await click('Review & Confirm');
      await until('document.body.innerText.includes("Review extracted invoice")', 'repeated confirmation editor');
      await evaluate(`[...document.querySelectorAll('label')].find(item=>item.textContent.includes('I have compared the fields')).querySelector('input').click()`);
      await click('Confirm & Save Invoice');
      await until('document.body.innerText.includes("Review & Confirm")', 'reconfirmed detail');
      assert.equal(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.filter(item=>item.invoiceNumber==="OCR-TEST-789").length'), 1);
      await navigate(route, 'Original preview unavailable');
      assert.equal(await evaluate('document.querySelector("button[aria-label=Download]").disabled'), true);
      console.log('PASS extracted review -> confirmation -> repeat confirmation; refresh states original is unavailable');
    }
    console.log('PASS real extraction and session preview: ' + name);
  }
  const invalid = path.join(temp, 'corrupt.pdf'); fs.writeFileSync(invalid, '%PDF-1.7\ninvalid synthetic content');
  await navigate('/app/invoices/upload', 'Upload a supplier invoice'); await upload(invalid);
  await until('Boolean(document.querySelector("[role=alert]")) && [...document.querySelectorAll("button")].some(item=>item.textContent.trim()==="Enter details manually" && !item.disabled)', 'corrupt PDF fallback');
  await click('Enter details manually'); await until('document.body.innerText.includes("Review extracted invoice")', 'manual fallback editor');
  console.log('PASS corrupt PDF error and manual-entry fallback');
  const protectedPdf = new jsPDF({ encryption: { userPassword: 'synthetic-test-password', ownerPassword: 'synthetic-test-owner' } });
  protectedPdf.text('Synthetic encrypted invoice', 15, 25);
  const protectedFile = path.join(temp, 'encrypted.pdf'); fs.writeFileSync(protectedFile, Buffer.from(protectedPdf.output('arraybuffer')));
  await navigate('/app/invoices/upload', 'Upload a supplier invoice'); await upload(protectedFile);
  await until('document.body.innerText.includes("This PDF is encrypted")', 'encrypted PDF error');
  const longPdf = new jsPDF(); for (let index = 0; index < 20; index++) longPdf.addPage();
  const longFile = path.join(temp, 'long.pdf'); fs.writeFileSync(longFile, Buffer.from(longPdf.output('arraybuffer')));
  await upload(longFile); await until('document.body.innerText.includes("up to 20 PDF pages")', 'page count limit');
  console.log('PASS encrypted and over-page-limit PDFs show bounded error states');
  await upload(path.join(temp, 'invoice.png')); await delay(50); await upload(path.join(temp, 'digital.pdf'));
  await until('document.body.innerText.includes("Text extraction finished") && document.body.innerText.includes("digital.pdf")', 'new selection wins', 130000);
  await delay(1000);
  assert.ok(await evaluate('document.body.innerText.includes("digital.pdf")'), 'stale image result overwrote new PDF');
  console.log('PASS rapid upload selection keeps the latest document');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate('/app/invoices/new', 'Invoice details');
  assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'manual editor overflows mobile viewport');
  console.log('PASS manual editor fits a 390px mobile viewport');
  if (process.argv.includes('--stage2')) {
    await send('Emulation.clearDeviceMetricsOverride');
    await require('./browser-stage2-flows.cjs').run({ evaluate, navigate, click, input, select, until, upload, send, delay, temp });
  }
  if (process.argv.includes('--stage3')) {
    await send('Emulation.clearDeviceMetricsOverride');
    await require('./browser-stage3-flows.cjs').run({ evaluate, navigate, click, input, select, until, upload, send, delay, temp });
  }
  if (process.argv.includes('--milestone1')) {
    await require('./browser-milestone1-flows.cjs').run({evaluate,navigate,click,input,select,until,send,delay,temp,detailRoute,dialogs,setDialogAcceptance:(value)=>{acceptDialog=value;}});
  }
  if (process.argv.includes('--milestone2')) {
    await require('./browser-milestone2-flows.cjs').run({evaluate,navigate,click,input,select,until,upload,send,delay,temp});
  }
  if (process.argv.includes('--frontend')) {
    await require('./browser-frontend-phase.cjs').run({evaluate,navigate,click,input,select,until,send,delay,temp});
  }
  if (process.argv.includes('--frontend-batch2')) {
    await require('./browser-frontend-batch2.cjs').run({evaluate,navigate,click,input,send,delay,temp});
  }
  assert.equal(exceptions.length, 0, 'Browser runtime exceptions: ' + exceptions.join('; '));
  console.log('PASS no uncaught page exceptions; isolated synthetic profile only');
}

run().catch(error => { console.error('FAIL ' + error.stack); process.exitCode = 1; }).finally(async () => {
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close', {}, null); } catch {} socket.close(); }
  chrome?.kill(); server?.kill();
  for (const item of waiting.values()) clearTimeout(item.timer);
  console.log('Synthetic test artifacts retained at: ' + temp);
});

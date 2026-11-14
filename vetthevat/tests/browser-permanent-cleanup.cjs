const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {loadSource}=require('./load-source.cjs');
exports.run=async({evaluate,navigate,send,port,root,temp,restartTestChrome})=>{
 const base='http://127.0.0.1:'+port,shots=path.join(root,'docs/previews/permanent-cleanup');fs.mkdirSync(shots,{recursive:true});
 const bootstrap=loadSource('lib/workspace-bootstrap'),{restoreWorkspace,workspaceStorageKey}=loadSource('lib/workspace');
 // Run the actual read-only TypeScript bootstrap functions in the isolated
 // browser. This tests storage behavior; it does not mount a private workspace.
 const helpers=`const workspaceStorageKey=${JSON.stringify(workspaceStorageKey)};${restoreWorkspace.toString()};${bootstrap.emptyWorkspace.toString()};${bootstrap.loadLocalWorkspace.toString()};${bootstrap.exportLocalWorkspace.toString()};`;
 const hydrate=()=>evaluate(`(()=>{${helpers}return loadLocalWorkspace(localStorage)})()`);
 await navigate('/login','Sign in');
 assert.equal(await evaluate('localStorage.length'),0);
 for(let i=0;i<2;i++){
  const state=await hydrate();for(const key of ['invoices','companies','suppliers','customers','documents','tickets','teamMembers','auditLog','notifications'])assert.deepEqual(state[key],[]);
  for(const key of ['accounts','transactions','allocations','events'])assert.deepEqual(state.bank[key],[]);
  assert.equal(await evaluate('localStorage.length'),0);await navigate('/login','Sign in');
 }
 // Enumerate every existing private page for direct navigation (including IDs).
 const pages=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name==='page.tsx')pages.push(full);}}walk(path.join(root,'app/app'));
 for(const page of pages){const route='/'+path.relative(path.join(root,'app'),path.dirname(page)).replace(/\\/g,'/').replace(/\[[^\]]+\]/g,'synthetic-record');
  const response=await fetch(base+route,{redirect:'manual',headers:{cookie:'__Host-vetthevat-session=forged','x-role':'Owner','x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'}});
  assert.equal(response.status,307,route);assert.ok(response.headers.get('location').includes('/login?setup=required'));assert.ok(response.headers.get('cache-control').includes('no-store'));
 }
 for(const route of ['/api','/api/v1/invoices','/api/stage1/companies/11111111-1111-4111-8111-111111111111/documents'])for(const method of ['GET','POST','PUT','DELETE']){
  const response=await fetch(base+route,{method,headers:{authorization:'Bearer forged','x-role':'Owner'}});assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);
 }
 const rsc=await fetch(base+'/app/dashboard',{redirect:'manual',headers:{rsc:'1','next-router-prefetch':'1'}});assert.equal(rsc.status,307);
 for(const width of [390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});
  for(const [route,text,label] of [['/login','Sign in','fresh-access-blocked'],['/','VAT','fresh-public-home']]){
   await navigate(route,text);assert.equal(await evaluate('document.querySelectorAll("input[type=password]:not(:disabled)").length'),0);
   assert.equal(await evaluate('/Demo Login|Continue as Demo|Guest Login|Demo Business Ltd/i.test(document.body.innerText)'),false);
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   fs.writeFileSync(path.join(shots,`${label}-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  }
 }
 await restartTestChrome();await navigate('/login','Sign in');
 assert.equal(await evaluate('localStorage.length'),0);assert.deepEqual((await hydrate()).invoices,[]);
 const legacy=loadSource('tests/fixtures/legacy-workspace');
 const state=restoreWorkspace(JSON.stringify({invoices:legacy.invoices,documents:legacy.documents}),{...legacy,selectedCompanyId:legacy.companies[0].id,settings:{}});
 state.invoices[0].notes='Synthetic owner edit to a historical identity';state.invoices.push({...state.invoices[0],id:'genuine-synthetic-id',invoiceNumber:'USER-CREATED-001'});
 state.customers=[{id:'genuine-customer',companyId:state.selectedCompanyId,name:'Synthetic user customer',status:'Active'}];
 state.bank={accounts:[{id:'genuine-bank',companyId:state.selectedCompanyId,currency:'GBP',name:'Synthetic user bank'}],transactions:[],allocations:[],events:[]};
 state.subscriptionPreview={periodStart:'2026-10-01',periodEnd:'2026-11-01',expiresOn:'2099-01-01',inAppReminders:true,emailReminders:true,renewalMethod:'Card'};
 const raw=JSON.stringify(state,null,2),oldBackup='synthetic historical recovery bytes';
 await evaluate(`localStorage.setItem(${JSON.stringify(workspaceStorageKey)},${JSON.stringify(raw)});localStorage.setItem('vet-the-vat-before-demo-cleanup-v1',${JSON.stringify(oldBackup)});localStorage.setItem('role','admin');localStorage.setItem('isAuthenticated','true');sessionStorage.setItem('isAuthenticated','true')`);
 for(const route of ['/app/dashboard','/app/invoices','/app/ors']){await navigate(route,'Sign in');assert.equal(await evaluate('location.pathname'),'/login');assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(workspaceStorageKey)})`),raw);const restored=await hydrate();assert.equal(restored.invoices.length,state.invoices.length);assert.equal(restored.invoices[0].notes,state.invoices[0].notes);}
 assert.equal(await evaluate(`(()=>{${helpers}return exportLocalWorkspace(localStorage)})()`),raw);
 const logout=await fetch(base+'/api/auth/logout',{method:'POST'});assert.equal(logout.status,503);
 // Actual same-profile Chrome process restart proves persistence/no reseeding.
 await restartTestChrome();await navigate('/login','Sign in');
 assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(workspaceStorageKey)})`),raw);assert.equal(await evaluate("localStorage.getItem('vet-the-vat-before-demo-cleanup-v1')"),oldBackup);
 assert.equal((await hydrate()).invoices.length,state.invoices.length);
 await navigate('/app/dashboard','Sign in');assert.equal(await evaluate('location.pathname'),'/login');
 // Visual QA of the real empty ORS component in an isolated DOM, clearly
 // labelled. This is not a screenshot of an authenticated application session.
 const html=await require('./cleanup-component-render.cjs').renderOrs();
 const css=fs.readdirSync(path.join(root,'.next/static/chunks')).filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync(path.join(root,'.next/static/chunks',name),'utf8')).join('\n');
 await send('Page.navigate',{url:'about:blank'});
 const tree=await send('Page.getFrameTree');
 await send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="color:#14231a;background:white;font-family:Arial,sans-serif"><main style="max-width:1100px;margin:auto;padding:24px"><p style="margin-bottom:24px">Isolated empty-component render · private application routes remain blocked</p>${html}</main></body></html>`});
 await new Promise(resolve=>setTimeout(resolve,500));
 for(const width of [390,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync(path.join(shots,`ors-empty-component-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));}
 const result={privatePagesChecked:pages.length,apiDenials:12,freshHydration:'empty, no storage writes',existingSyntheticData:'exact raw bytes preserved after navigation, reload, logout denial and Chrome restart',export:'exact raw metadata',signedInWorkflows:'blocked; no bypass',userExistingProfile:'not inspected; manual verification outstanding',screenshots:fs.readdirSync(shots),temporaryProfile:temp};
 fs.writeFileSync(path.join(root,'.cleanup/browser-results.json'),JSON.stringify(result,null,2));console.log('PASS permanent cleanup browser regression: '+JSON.stringify(result));
};

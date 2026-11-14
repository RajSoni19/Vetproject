const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.run=async({evaluate,navigate,click,until,send,root,port})=>{
 const base='http://127.0.0.1:'+port;
 for(const route of ['/app','/app/dashboard','/app/admin','/app/invoices','/app/invoices/new','/app/invoices/upload','/app/companies','/app/subscription','/app/documents/synthetic']){
  const result=await fetch(base+route,{redirect:'manual',headers:{cookie:'__Host-vetthevat-session=forged','x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy','x-role':'admin'}});
  assert.equal(result.status,307,route);assert.ok(result.headers.get('location').endsWith('/login?setup=required'));assert.ok(result.headers.get('cache-control').includes('no-store'));assert.equal(result.headers.get('set-cookie'),null);
 }
 for(const route of ['/api','/api/v1/invoices','/api/v1/companies','/api/v1/documents/synthetic']){const result=await fetch(base+route,{headers:{authorization:'Bearer forged',cookie:'__Host-vetthevat-session=expired'}});assert.equal(result.status,401);assert.equal((await result.json()).error.code,'UNAUTHENTICATED');}
 for(const email of ['unknown@example.test','admin@vetthevat.com']){const result=await fetch(base+'/api/auth/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'invalid-synthetic-input'})});assert.equal(result.status,503);assert.equal((await result.json()).error.code,'UNAVAILABLE');assert.equal(result.headers.get('set-cookie'),null);}
 assert.equal((await fetch(base+'/api/auth/logout',{method:'POST'})).status,503);
 assert.equal((await fetch(base+'/api/auth/bootstrap',{method:'POST'})).status,503);
 const rsc=await fetch(base+'/app/dashboard',{redirect:'manual',headers:{rsc:'1','next-router-prefetch':'1'}});assert.equal(rsc.status,307);
 await navigate('/app/dashboard','Sign in');assert.ok(await evaluate('location.pathname==="/login"'));
 assert.equal(await evaluate('document.querySelectorAll("input[type=password]:not(:disabled)").length'),0);assert.equal(await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")'),null);
 assert.equal(await evaluate('document.body.innerText.includes("Enter Demo")||document.body.innerText.includes("Demo Business Ltd")'),false);
 // Preserve a complete synthetic local workspace verbatim; no auth reads or clears it.
 const {loadSource}=require('./load-source.cjs');const state=loadSource('lib/workspace-bootstrap').emptyWorkspace();state.companies.push({id:'synthetic-preserved-company',name:'Synthetic user company',status:'Active',currency:'GBP',country:'United Kingdom'});
 const raw=JSON.stringify(state);await evaluate(`localStorage.setItem('vet-the-vat-workspace-v1',${JSON.stringify(raw)});localStorage.setItem('role','admin');localStorage.setItem('isAuthenticated','true')`);
 await navigate('/app/dashboard','Sign in');assert.equal(await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")'),raw);
 await navigate('/app/dashboard','Sign in');assert.ok(await evaluate('location.pathname==="/login"'));assert.equal(await evaluate('document.cookie.includes("vetthevat-session")'),false);
 for(const [route,text] of [['/register','Create your account'],['/onboarding','Workspace setup requires sign-in'],['/forgot-password','Reset your password'],['/reset-password','Choose a new password'],['/verify-email','Email verification']]){await navigate(route,text);assert.equal(await evaluate('document.querySelectorAll("input:not(:disabled)").length'),0);}
 const images=path.join(root,'docs/previews/admin-auth');fs.mkdirSync(images,{recursive:true});
 for(const width of [320,390,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:width<768});
  for(const [route,text,name] of [['/login','Sign in','setup'],['/plan-information','Plan information','plans'],['/pricing','Simple pricing','pricing']]){
   await navigate(route,text);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route+' overflow '+width);
   if(name!=='setup')for(const value of ['£9','£15','£25','Optional · £5/month','Basic + ORS: £14/month','Recommended'])assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(value)})`),value);
   if(width===390||width===1440){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(images,name+'-'+width+'.png'),Buffer.from(shot.data,'base64'));}
  }
 }
 console.log('PASS live blocked-state auth: private/API/RSC/forged-role denial, generic login unavailability, no credentials/default session, no bootstrap endpoint, preserved browser records, safe account pages, correct public Plan Information and pricing; 320/390/768/1440 widths');
};

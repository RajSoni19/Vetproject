const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
exports.run=async({evaluate,navigate,send,port,root,until,restartTestServer})=>{
 const base='http://127.0.0.1:'+port;
 const publicRoutes=['/','/about','/features','/pricing','/contact','/support','/get-started','/privacy','/terms'];
 const privateRoutes=['/app','/app/dashboard','/app/invoices','/app/invoices?type=Sales','/app/invoices/new','/app/invoices/upload','/app/invoices/synthetic','/app/documents','/app/documents/synthetic','/app/customers','/app/customers/synthetic','/app/suppliers','/app/suppliers/synthetic','/app/banking','/app/vat','/app/reports','/app/ors','/app/settings','/app/subscription','/app/admin','/app/admin/leads','/app/team','/app/audit','/app/companies','/app/pos'];
 const shots=path.join(root,'docs/previews/auth-restoration');fs.mkdirSync(shots,{recursive:true});
 for(const width of [390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  for(const route of publicRoutes){assert.equal((await fetch(base+route)).status,200,route);await navigate(route,'Sign in');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route+' overflow '+width);assert.equal(await evaluate('Boolean(document.querySelector(".workspace"))'),false);}
  await navigate('/','Sign in');
  if(width===390){await evaluate('document.querySelector("button[aria-controls=public-mobile-navigation]").click()');await until('Boolean(document.querySelector("#public-mobile-navigation"))','mobile nav');await evaluate('document.querySelector("#public-mobile-navigation a[href=\\"/login\\"]").click()');}
  else await evaluate('document.querySelector("header a[href=\\"/login\\"]").click()');
  await until('location.pathname==="/login"&&document.body.innerText.includes("Sign in")','sign-in navigation');
  assert.equal(await evaluate('document.querySelectorAll("input[type=password]:not(:disabled)").length'),0);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  fs.writeFileSync(path.join(shots,'login-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 }
 for(const route of privateRoutes)for(const headers of [{},{cookie:'__Host-vetthevat-session=forged','x-role':'admin',rsc:'1','next-router-prefetch':'1'},{cookie:'__Host-vetthevat-session=a; __Host-vetthevat-session=b'}]){
  const response=await fetch(base+route,{redirect:'manual',headers});assert.equal(response.status,307,route);assert.ok(response.headers.get('location').endsWith('/login?setup=required'));assert.ok(response.headers.get('cache-control').includes('no-store'));assert.equal(response.headers.get('set-cookie'),null);
 }
 for(const api of ['/api/admin/leads','/api/stage1/companies','/api/v1/invoices'])for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await fetch(base+api,{method,headers:{cookie:'__Host-vetthevat-session=forged','x-role':'admin'}})).status,401,api);
 for(const api of ['/api/auth/session','/api/auth/logout']){const response=await fetch(base+api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@vetthevat.com',password:'isolated-never-real'})});assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.ok(response.headers.get('cache-control').includes('no-store'));}
 assert.equal((await fetch(base+'/api/auth/session')).status,503);
 await navigate('/login','Sign in');await evaluate('localStorage.setItem("isAuthenticated","true");localStorage.setItem("role","admin")');await navigate('/app/dashboard','Sign in');assert.equal(await evaluate('location.pathname'),'/login');await send('Page.reload');await until('document.body?.innerText.includes("Sign in")','unauthorized refresh');assert.equal(await evaluate('Boolean(document.querySelector(".workspace"))'),false);
 assert.equal(await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")'),null);assert.equal(await evaluate('/Demo Login|Guest Login|Demo Business Ltd/.test(document.body.innerText)'),false);
 await restartTestServer({VETTHEVAT_MARKETING_ONLY:'1',LEADS_ENABLED:'0',LEADS_EMAIL_DELIVERY_APPROVED:'0'});
 assert.equal((await fetch(base+'/login')).status,200);assert.equal((await fetch(base+'/app/dashboard')).status,404);assert.equal((await fetch(base+'/api/admin/leads')).status,404);for(const route of publicRoutes)assert.equal((await fetch(base+route)).status,200);
 const result={publicRoutes,privateRoutesChecked:privateRoutes.length,privateVariants:['no cookie','forged cookie and role + RSC/prefetch','duplicate cookies'],widths:[390,1440],publicSignInNavigation:'desktop and mobile passed',login:'account page reachable; inputs disabled without storage',privatePages:'redirect to setup; no workspace rendered',privateApis:'401 in app mode; 404 in marketing mode',sessionPost:'503 with unconfigured services; no cookie',logoutPost:'503 with unconfigured services; no cookie',localAuthBypass:'rejected',demoData:'none created',marketingLogin:'200',identity:'PostgreSQL disabled for this boundary test',authenticatedBrowserFlow:'covered by separate real PostgreSQL browser suite',financialDataPublic:'not exposed by checked routes'};
 fs.writeFileSync(path.join(root,'.auth-restoration/browser-results.json'),JSON.stringify(result,null,2));console.log('PASS routing/security browser checks: '+JSON.stringify(result));
};

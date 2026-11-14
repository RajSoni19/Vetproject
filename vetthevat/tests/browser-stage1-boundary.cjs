const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
exports.run=async({evaluate,navigate,send,port,root})=>{
 const base='http://127.0.0.1:'+port;
 for(const route of ['/app/ors','/app/invoices','/app/documents']){
  const response=await fetch(base+route,{redirect:'manual',headers:{cookie:'__Host-vetthevat-session=forged','x-role':'Owner'}});
  assert.equal(response.status,307);assert.ok(response.headers.get('location').includes('/login?setup=required'));
 }
 for(const method of ['GET','POST','PUT']){
  const response=await fetch(base+'/api/stage1/companies/11111111-1111-4111-8111-111111111111/documents',{method,headers:{authorization:'Bearer forged','x-role':'Owner'}});
  assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);assert.equal((await response.json()).error.code,'UNAUTHENTICATED');
 }
 await navigate('/login','Administrator sign-in');
 await evaluate("localStorage.setItem('stage1-preserved-record','synthetic-only')");
 await navigate('/app/ors','Administrator sign-in');
 assert.equal(await evaluate('location.pathname'),'/login');
 assert.equal(await evaluate("localStorage.getItem('stage1-preserved-record')"),'synthetic-only');
 const directory=path.join(root,'docs/previews/stage1');fs.mkdirSync(directory,{recursive:true});
 for(const width of [390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
  await navigate('/pricing','Simple pricing');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync(path.join(directory,`pricing-${width}.png`),Buffer.from(screenshot.data,'base64'));
 }
 console.log('PASS Stage 1 browser boundary: ORS/private routes blocked, forged API identities denied for GET/POST/PUT, browser record preserved, pricing at 390/1440 without overflow. Signed-in workflows remain blocked.');
};

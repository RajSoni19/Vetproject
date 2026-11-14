const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {randomUUID,randomBytes}=require('node:crypto');const {loadSource}=require('./load-source.cjs');
exports.run=async({evaluate,navigate,send,port,root,until,delay,click,onProtocol,restartTestServer})=>{
 const base='http://127.0.0.1:'+port,shots=path.join(root,'docs/previews/leads');fs.mkdirSync(shots,{recursive:true});
 const receiptSecret=randomBytes(32).toString('hex');let mode='invalid',posts=0;const keys=[];let protocolFailure;
 await navigate('/get-started','Get Started');
 assert.ok(await evaluate('document.querySelector("form button[type=submit]").disabled'));
 assert.equal((await fetch(base+'/api/public/leads',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await fetch(base+'/api/public/leads')).status,405);
 await navigate('/get-started/thank-you','Get Started');assert.equal(await evaluate('location.pathname'),'/get-started');
 for(const route of ['/','/product','/features','/benefits','/how-it-works','/pricing','/faq','/about','/contact','/support','/mobile-app','/privacy','/plan-information','/security','/terms']){
  await navigate(route,'Get Started');assert.ok(await evaluate('[...document.querySelectorAll("a")].filter(a=>a.textContent.trim()==="Get Started").every(a=>a.getAttribute("href")==="/get-started")'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await navigate('/','Get Started');
 await evaluate('[...document.querySelectorAll("header a")].find(a=>a.textContent.trim()==="Get Started").click()');await until('location.pathname==="/get-started"','desktop CTA navigation');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});await navigate('/','Get Started');
  await evaluate(`document.querySelector('button[aria-controls="public-mobile-navigation"]').click()`);await until('Boolean(document.querySelector("#public-mobile-navigation"))','mobile menu');await evaluate(`document.querySelector('#public-mobile-navigation a[href="/get-started"]').click()`);await until('location.pathname==="/get-started"','mobile CTA navigation');
 for(const width of [390,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await navigate('/get-started','Get Started');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  assert.ok(await evaluate('[...document.querySelectorAll("input:not([type=hidden]),select,textarea")].every(field=>field.id&&document.querySelector(`label[for="${field.id}"]`))'));
  fs.writeFileSync(path.join(shots,`unconfigured-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 }
 // Local-only configuration uses an unreachable loopback DB and an HTTPS
 // origin that cannot match this loopback HTTP server. Any un-intercepted POST
 // fails origin validation BEFORE a DB connection or provider request.
 await restartTestServer({LEADS_ENABLED:'1',LEADS_ORIGIN:'https://leads.example.test',LEADS_DATABASE_URL:'postgresql://vetthevat_leads_runtime:synthetic@127.0.0.1:1/leads_synthetic',LEADS_DATABASE_NAME:'leads_synthetic',LEADS_HASH_SECRET:randomBytes(32).toString('hex'),LEADS_RECEIPT_SECRET:receiptSecret,LEADS_TURNSTILE_SITE_KEY:'synthetic_site_key_12345',LEADS_TURNSTILE_SECRET_KEY:'synthetic-never-sent',LEADS_EMAIL_DELIVERY_APPROVED:'0'});
 const stop=onProtocol(message=>{
  if(message.method!=='Fetch.requestPaused')return;
  void(async()=>{
   const {requestId,request}=message.params;
   if(request.url.startsWith('https://challenges.cloudflare.com/')){
    const script="window.turnstile={render:function(el,o){window.__leadTestChallenge=o;setTimeout(function(){o.callback('synthetic-token')},10);return 'synthetic-widget'},remove:function(){},reset:function(){setTimeout(function(){window.__leadTestChallenge.callback('synthetic-token')},10)}};";
    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:'application/javascript'}],body:Buffer.from(script).toString('base64')});return;
   }
   if(request.url===base+'/api/public/leads'&&request.method==='POST'){
    posts++;keys.push(request.headers['idempotency-key']??request.headers['Idempotency-Key']);const payload=JSON.parse(request.postData);assert.equal(payload.consent,true);assert.equal(payload.service,'VAT + ORS');
    let status=400,body={error:{message:'Please check the highlighted fields.',fields:{email:'Synthetic server validation error.'}}};const headers=[{name:'content-type',value:'application/json'}];
    if(mode==='unavailable'){status=503;body={error:{message:'Your enquiry could not be confirmed. Please retry.'}};}
    if(mode==='success'){status=200;const id=randomUUID();body={received:true,reference:id,redirect:'/get-started/thank-you'};headers.push({name:'set-cookie',value:`__Host-vtv-lead-receipt=${loadSource('lib/server/leads/core').receipt(id,receiptSecret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`});await delay(300);}
    await send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:headers,body:Buffer.from(JSON.stringify(body)).toString('base64')});return;
   }
   await send('Fetch.continueRequest',{requestId});
  })().catch(error=>{protocolFailure=error;});
 });
 await send('Fetch.enable',{patterns:[{urlPattern:'https://challenges.cloudflare.com/*'},{urlPattern:'*api/public/leads'}]});
 async function fill(){await evaluate(`(()=>{const values={fullName:'Synthetic Browser Enquirer',email:'browser@example.test',phone:'+44 7700 900123',businessName:'Synthetic Browser Business',requirements:'Synthetic browser requirements only'};for(const [name,value]of Object.entries(values)){const el=document.querySelector('[name="'+name+'"]');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}document.querySelector('[name=service]').value='VAT + ORS';document.querySelector('[name=consent]').checked=true})()`);}
 try{
  for(const width of [390,1440]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});await navigate('/get-started','Submit enquiry');await until('Boolean(window.__leadTestChallenge)','mock bot widget');
   assert.equal(await evaluate('document.querySelector("form").checkValidity()'),false);const count=posts;await evaluate('document.querySelector("form").requestSubmit()');await delay(150);assert.equal(posts,count);
   await fill();await evaluate('document.querySelector("[name=consent]").checked=false');assert.equal(await evaluate('document.querySelector("form").checkValidity()'),false);await evaluate('document.querySelector("[name=consent]").checked=true');
   await evaluate('document.querySelector("#lead-fullName").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement.id'),'lead-email');
   assert.equal(await evaluate('document.querySelector("form").checkValidity()'),true);assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
   fs.writeFileSync(path.join(shots,`form-synthetic-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  }
  mode='invalid';await click('Submit enquiry');await until('document.body.innerText.includes("Synthetic server validation error.")','server field error');assert.equal(await evaluate('document.activeElement.getAttribute("role")'),'alert');assert.equal(await evaluate('location.pathname'),'/get-started');
  mode='unavailable';await click('Submit enquiry');await until('document.body.innerText.includes("could not be confirmed")','safe unavailable error');assert.equal(await evaluate('location.pathname'),'/get-started');
  mode='success';const before=posts;await evaluate('document.querySelector("form").requestSubmit();document.querySelector("form").requestSubmit()');await until('location.pathname==="/get-started/thank-you"&&document.body.innerText.includes("Thank you for your interest in VET THE VAT.")','signed confirmation from synthetic saved response');assert.equal(posts,before+1);assert.equal(new Set(keys).size,1);
  assert.ok(await evaluate('document.body.innerText.includes("Your enquiry has been received, and our team will contact you shortly.")'));assert.equal(await evaluate('localStorage.length'),0);assert.equal(await evaluate('sessionStorage.length'),0);
  fs.writeFileSync(path.join(shots,'confirmation-synthetic-1440.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await send('Network.clearBrowserCookies');await navigate('/get-started/thank-you','Get Started');assert.equal(await evaluate('location.pathname'),'/get-started');
  for(const route of ['/app/admin/leads','/api/admin/leads']){const response=await fetch(base+route,{redirect:'manual',headers:{cookie:'__Host-vetthevat-session=forged','x-role':'Owner'}});assert.equal(response.status,route.startsWith('/app')?307:401);}
  assert.equal((await fetch(base+'/api/internal/lead-notifications',{method:'POST'})).status,503);
  assert.equal((await fetch(base+'/api/internal/lead-notifications')).status,405);
  await restartTestServer({VETTHEVAT_MARKETING_ONLY:'1',LEADS_ENABLED:'0',LEADS_EMAIL_DELIVERY_APPROVED:'0'});
  assert.equal((await fetch(base+'/get-started')).status,200);
  assert.equal((await fetch(base+'/api/public/leads',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,503);
  assert.equal((await fetch(base+'/api/admin/leads')).status,404);
  if(protocolFailure)throw protocolFailure;
  const results={publicPagesChecked:15,widths:[390,1440],ctaNavigation:'desktop and mobile menu clicks passed',keyboard:'Tab moves through labelled form inputs',defaultSubmission:'503, disabled UI',publicLeadList:'405',clientValidation:'passed',providerCalls:'CDP-intercepted synthetic only',successAndFailureUI:'passed',duplicateClick:'single POST',idempotencyRetry:'same key',confirmation:'signed cookie; direct/cleared-cookie access redirects',adminAccess:'denied',worker:'disabled without approval; GET denied',marketingMode:'lead page accessible; intake disabled without config; admin denied',browserPersistence:'no localStorage/sessionStorage',realPersistence:'not verified',realEmail:'not sent or verified'};
  fs.writeFileSync(path.join(root,'.leads/browser-results.json'),JSON.stringify(results,null,2));console.log('PASS lead browser regression: '+JSON.stringify(results));
 }finally{stop();await send('Fetch.disable');}
};

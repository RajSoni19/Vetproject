const s=require('./saas-services.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const origin='https://localhost:3444';

async function main(){
 const evidence=JSON.parse(fs.readFileSync('.launch-acceptance/marketplace-postgres.json','utf8'));
 const company=evidence.syntheticCompanyId,materialId=evidence.syntheticMaterialId;
 const identity=await s.sessionForVerifiedTestIdentity(await s.provisionVerifiedTestIdentity('ors-marketplace-browser'));
 await s.operator(db=>db.query(`INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES($1,$2,'Admin','active')`,[identity.userId,company]));
 const cookie=`__Host-vetthevat-session=${identity.token}`;
 const session=await s.application('/api/auth/session',{cookie});
 s.assert.equal(session.status,200,'synthetic authenticated session is valid');
 const selection=await s.application('/api/account/company-selection',{method:'POST',cookie,csrf:session.body.csrfToken,body:{companyId:company}});
 s.assert.equal(selection.status,200,'selected authorized synthetic company');
 const product=await s.operator(async db=>(await db.query(`SELECT name FROM operations.materials WHERE company_id=$1 AND id=$2`,[company,materialId])).rows[0]);
 s.assert.ok(product?.name,'synthetic product exists');

 const cert=new s.crypto.X509Certificate(fs.readFileSync(path.join(s.directory,'localhost.crt'))),spki=s.crypto.createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
 const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'vtv-live-marketplace-chrome-'));
 const chrome=spawn(process.env.VET_VAT_CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-gpu','--ignore-certificate-errors-spki-list='+spki,'--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','about:blank'
 ],{windowsHide:true,stdio:'ignore'});
 let socket,sessionId,seq=0,send;
 const pending=new Map(),waRequests=[];
 try{
  let marker;
  for(let i=0;i<100;i++){try{marker=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);break;}catch{}await delay(100);}
  s.assert.ok(marker,'Chrome DevTools endpoint');
  socket=new WebSocket('ws://127.0.0.1:'+marker[0]+marker[1]);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.method==='Network.requestWillBeSent'&&/wa\.me/i.test(message.params.request.url))waRequests.push(message.params.request.url);
   if(pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}
  });
  send=(method,params={},target=sessionId)=>new Promise((resolve,reject)=>{
   const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);
   pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));
  });
  const target=await send('Target.createTarget',{url:'about:blank'},null);
  sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await send('Network.enable');await send('Runtime.enable');await send('Page.enable');
  const saved=await send('Network.setCookie',{url:origin+'/',name:'__Host-vetthevat-session',value:identity.token,path:'/',secure:true,httpOnly:true,sameSite:'Strict'});
  s.assert.equal(saved.success,true,'authenticated cookie installed only in local test browser');
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
   return result.result.value;
  };
  const until=async(expression)=>{
   for(let i=0;i<200;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}
   throw Error('Timed out waiting for '+expression+'; page text: '+await evaluate('document.body.innerText'));
  };
  const click=async expression=>{await evaluate(`(()=>{const e=${expression};if(!e||e.disabled)throw Error('Target button is unavailable');e.click();})()`);};
  const navigate=async url=>{await send('Page.navigate',{url:origin+url});await until(`document.querySelector('[data-testid="ors-product-marketplace"]')&&!document.body.innerText.includes('Loading company shopping')`);};
  const passes=[];
  await navigate('/app/ors/shop');
  await until(`Array.from(document.querySelectorAll('[data-testid="product-card"]')).some(card=>card.innerText.includes(${JSON.stringify(product.name)}))`);
  const card=`Array.from(document.querySelectorAll('[data-testid="product-card"]')).find(item=>item.innerText.includes(${JSON.stringify(product.name)}))`;
  s.assert.equal(await evaluate(`${card}.innerText.includes('Lowest comparable')`),true,'live page shows inline supplier price comparison');
  s.assert.ok(await evaluate(`${card}.innerText.includes('Synthetic Orchard')&&${card}.innerText.includes('Synthetic Market')`),'both live supplier offers are rendered');
  passes.push('Authenticated live ORS shop renders the persisted product and both supplier quotes with inline comparison');

  await click(`${card}.querySelector('input[type="radio"][aria-label$=": Synthetic Orchard"]')`);
  await click(`Array.from(${card}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Add to cart')`);
  await until(`document.querySelector('[data-testid="cart-badge"]')?.textContent==='1'`);
  await until(`Array.from(document.querySelectorAll('[data-testid="product-card"]')).some(item=>item.innerText.includes(${JSON.stringify(product.name)}))`);
  await click(`${card}.querySelector('input[type="radio"][aria-label$=": Synthetic Market"]')`);
  await click(`Array.from(${card}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Add to cart')`);
  await until(`document.querySelector('[data-testid="cart-badge"]')?.textContent==='2'`);
  passes.push('Live UI adds the same product to two distinct supplier groups');

  await navigate('/app/ors/cart');
  await until(`document.body.innerText.includes('Synthetic Orchard')&&document.body.innerText.includes('Synthetic Market')`);
  const increase=`document.querySelector('button[aria-label=${JSON.stringify('Increase '+product.name)}]')`;
  await click(increase);
  await until(`Array.from(document.querySelectorAll('li')).some(line=>line.innerText.includes(${JSON.stringify(product.name)})&&line.innerText.includes('2.0000 box'))`);
  await send('Page.reload');
  await until(`document.querySelector('[data-testid="ors-product-marketplace"]')&&!document.body.innerText.includes('Loading company shopping')`);
  await until(`Array.from(document.querySelectorAll('li')).some(line=>line.innerText.includes(${JSON.stringify(product.name)})&&line.innerText.includes('2.0000 box'))`);
  await click(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Revalidate prices')`);
  await until(`document.body.innerText.includes('Current supplier prices and quantities revalidated')`);
  const cartText=await evaluate('document.body.innerText');
  s.assert.ok((cartText.includes('GBP 24.00')&&cartText.includes('GBP 13.20'))||(cartText.includes('GBP 12.00')&&cartText.includes('GBP 26.40')),`live cart VAT-inclusive totals are shown: ${cartText}`);
  passes.push('Quantity update persists across page refresh; supplier-specific VAT totals revalidate from PostgreSQL');

  await click(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Send Order on WhatsApp')`);
  await until(`document.body.innerText.includes('Saved supplier drafts · pending dispatch')`);
  await until(`document.querySelectorAll('a[href^="https://wa.me/"]').length===2`);
  const draftData=await evaluate(`Array.from(document.querySelectorAll('a[href^="https://wa.me/"]')).map(a=>({href:a.href,label:a.innerText,section:a.closest('section')?.innerText||''}))`);
  s.assert.equal(draftData.length,2);
  s.assert.ok(draftData.some(d=>d.href.startsWith('https://wa.me/447700900111')&&d.section.includes('Synthetic Orchard')));
  s.assert.ok(draftData.some(d=>d.href.startsWith('https://wa.me/447700900222')&&d.section.includes('Synthetic Market')));
  s.assert.ok(draftData.every(d=>d.section.includes('pending confirmation')&&d.section.includes('Draft order request')));
  s.assert.deepEqual(waRequests,[],'browser did not navigate to or request WhatsApp');
  passes.push('Live UI creates two supplier-specific pending drafts with the correct validated phone links; no WhatsApp request was sent');

  await navigate('/app/ors/shopping-orders');
  await until(`document.body.innerText.includes('ORS-')&&document.body.innerText.includes('pending dispatch')`);
  passes.push('Persisted pending orders appear in authenticated order history');

  const live=await s.operator(async db=>(await db.query(`SELECT d.id::text,d.order_reference,d.state,d.supplier_id::text,d.subtotal::text,d.vat_amount::text,d.total_amount::text FROM operations.shopping_dispatches d WHERE d.company_id=$1 AND d.created_by=$2 AND d.created_at>now()-interval '10 minutes' ORDER BY d.created_at DESC LIMIT 10`,[company,identity.userId])).rows);
  s.assert.equal(live.length,2,'two UI-created dispatches persisted');
  s.assert.ok(live.every(row=>row.state==='pending_dispatch'));
  s.assert.ok(live.every(row=>Number(row.total_amount)===Number(row.subtotal)+Number(row.vat_amount)));
  const report={browser:'Installed Chrome headless, authenticated live application',url:origin+'/app/ors/shop',companyId:company,passed:passes.length,passes,dispatches:live,whatsappRequestsSent:waRequests.length,evidencePath:'.launch-acceptance/marketplace-live-browser.json'};
  fs.mkdirSync('.launch-acceptance',{recursive:true});
  fs.writeFileSync('.launch-acceptance/marketplace-live-browser.json',JSON.stringify(report,null,2));
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  fs.writeFileSync('.launch-acceptance/marketplace-live-browser.png',Buffer.from(screenshot.data,'base64'));
  console.log('LIVE BROWSER PASS '+JSON.stringify(report));
 }finally{
  if(socket&&send){try{await send('Browser.close',{},null);}catch{}socket.close();}
  await delay(100);
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
  await s.operator(db=>db.query(`UPDATE web_auth.sessions SET revoked_at=now() WHERE token_hash=$1`,[s.loadSource('lib/server/web-auth/crypto').tokenHash(identity.token)]));
 }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

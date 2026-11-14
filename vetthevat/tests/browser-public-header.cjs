// Headless Chrome acceptance check for the live local public header.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.join(__dirname, '..', 'docs', 'previews', 'public-header');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vtv-public-header-'));
const chromePath = process.env.VET_VAT_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let chrome, socket, session, seq = 0;
const pending = new Map();
function send(method, params = {}, target = session) {
  return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: '+method)); }, 20000);
    pending.set(id, {resolve,reject,timer}); socket.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression,label) {
  for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(150);}
  throw Error('Timed out waiting for '+label+' at '+await evaluate('location.href'));
}
async function screenshot(name) {
  await evaluate('window.scrollTo({top:0,behavior:"instant"})');
  const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));
}
async function click(selector) { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.click()})()`); }

(async()=>{
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--ignore-certificate-errors','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:'ignore',windowsHide:true});
  const marker=path.join(profile,'DevToolsActivePort');let port,endpoint;
  for(let i=0;i<100;i++){try{[port,endpoint]=fs.readFileSync(marker,'utf8').trim().split(/\r?\n/);if(/^\d+$/.test(port)&&endpoint.startsWith('/devtools/'))break;}catch{}await delay(100);}
  assert.ok(port&&endpoint,'Chrome debug endpoint did not start');
  socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const target=await send('Target.createTarget',{url:'about:blank'},null);
  session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
  await send('Runtime.enable');await send('Page.enable');
  const widths=[390,768,1024,1280,1440],results=[];
  for(const width of widths){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
    await send('Page.navigate',{url:'https://localhost:3444/'});
    await waitFor("document.querySelector('header nav')",'public header');await delay(300);
    const result=await evaluate(`(()=>{const h=document.querySelector('header'),n=h.querySelector('nav[aria-label="Main navigation"]'),b=h.querySelector('button[aria-controls="public-mobile-navigation"]'),logo=h.querySelector('a[aria-label="VET THE VAT home"]');return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,headerHeight:Math.round(h.getBoundingClientRect().height),logoVisible:!!logo&&getComputedStyle(logo).display!=='none',desktopNavVisible:getComputedStyle(n).display!=='none',mobileButtonVisible:getComputedStyle(b).display!=='none',actions:[...h.querySelectorAll('a')].filter(a=>['Sign in','Download App','Get Started'].some(t=>a.textContent.includes(t))).map(a=>({text:a.textContent.trim(),visible:a.getClientRects().length>0,whiteSpace:getComputedStyle(a).whiteSpace,scroll:a.scrollWidth,client:a.clientWidth})),overflow:document.documentElement.scrollWidth>innerWidth,selectedLabel:h.querySelector('button[aria-haspopup="menu"]')?.innerText.trim()}})()`);
    assert.equal(result.overflow,false,`horizontal overflow at ${width}`);
    assert.equal(result.logoVisible,true,`logo missing at ${width}`);
    assert.equal(result.desktopNavVisible,width>=1280,`desktop nav breakpoint at ${width}`);
    assert.equal(result.mobileButtonVisible,width<1280,`mobile nav breakpoint at ${width}`);
    if(width>=1280)for(const item of result.actions.filter(a=>a.visible))assert.equal(item.whiteSpace,'nowrap',`${item.text} wraps at ${width}`);
    assert.ok(!result.selectedLabel?.includes('Complete'),`closed language label exposes completion status at ${width}`);
    await screenshot('header-'+width);results.push(result);
  }

  const gujaratiName=String.fromCharCode(0x0a97,0x0ac1,0x0a9c,0x0ab0,0x0abe,0x0aa4,0x0ac0);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('button[aria-controls="public-mobile-navigation"]');
  await screenshot('header-mobile-menu-390');
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="public-mobile-navigation"]').getAttribute('aria-expanded')`),'true','mobile menu did not open');
  await click('#public-mobile-navigation button[aria-haspopup="menu"]');
  assert.equal(await evaluate("!!document.querySelector('[role=menu]')"),true,'language menu did not open');
  await screenshot('header-mobile-language-menu-390');
  await evaluate("document.querySelectorAll('[role=menuitemradio]')[2].click()");
  assert.equal(await evaluate(`document.querySelector('#public-mobile-navigation button[aria-haspopup="menu"]').innerText.trim()`),gujaratiName,'locale selection failed');
  await evaluate(`document.querySelector('#public-mobile-navigation a[href="/product"]').click()`);
  await waitFor("location.pathname==='/product'",'mobile navigation');
  assert.equal(await evaluate('localStorage.getItem("vtv.preferred-locale.v1")'),'gu-IN','locale did not persist');
  await send('Page.navigate',{url:'https://localhost:3444/'});await waitFor(`location.pathname==='/' && document.querySelector('header button[aria-haspopup="menu"]')`,'reloaded header');
  await waitFor(`document.querySelector('header button[aria-haspopup="menu"]')?.innerText.includes(String.fromCharCode(0x0a97,0x0ac1,0x0a9c,0x0ab0,0x0abe,0x0aa4,0x0ac0))`,'locale hydration after refresh');
  assert.equal(await evaluate(`document.querySelector('header button[aria-haspopup="menu"]').innerText.trim()`),gujaratiName,'locale did not persist after refresh');
  await evaluate(`document.querySelector('button[aria-controls="public-mobile-navigation"]').focus()`);
  await click('button[aria-controls="public-mobile-navigation"]');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await evaluate(`document.querySelector('button[aria-controls="public-mobile-navigation"]').getAttribute('aria-expanded')`),'false','Escape did not close mobile navigation');
  assert.equal(await evaluate(`document.activeElement.matches('button[aria-controls="public-mobile-navigation"]')`),true,'Escape did not restore menu focus');

  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'https://localhost:3444/'});await waitFor(`location.pathname==='/' && document.querySelector('header button[aria-haspopup="menu"]')`,'desktop header');
  await delay(500);
  await evaluate(`document.querySelector('header button[aria-haspopup="menu"]').focus()`);
  await click('header button[aria-haspopup="menu"]');
  assert.equal(await evaluate("!!document.querySelector('[role=menu]')"),true,'desktop language menu failed');
  await screenshot('header-desktop-language-menu-1280');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  assert.equal(await evaluate("!!document.querySelector('[role=menu]')"),false,'Escape did not close language menu');
  assert.equal(await evaluate(`document.activeElement.matches('header button[aria-haspopup="menu"]')`),true,'language-menu Escape did not restore focus');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  assert.equal(await evaluate("!!document.querySelector('[role=menu]')"),true,'ArrowDown did not open language menu');
  await delay(100);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown'});
  assert.equal(await evaluate(`document.activeElement.innerText.startsWith('Espa'+String.fromCharCode(0xf1)+'ol')`),true,'ArrowDown did not move between language options');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'char',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await waitFor(`document.querySelector('header button[aria-haspopup="menu"]').innerText.startsWith('Espa'+String.fromCharCode(0xf1)+'ol')`,'keyboard language selection');
  assert.equal(await evaluate("!!document.querySelector('[role=menu]')"),false,'Enter did not close language menu after selecting');
  console.log(JSON.stringify({url:'https://localhost:3444',screenshots:output,breakpoints:results,interactions:{mobileMenu:true,mobileNavigation:true,localeSwitch:true,localePersistence:true,keyboardFocus:true,desktopLanguageMenu:true,noHorizontalOverflow:true}},null,2));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(()=>{
  try{socket?.close();}catch{}
  if(chrome&&chrome.exitCode===null)chrome.kill();
});

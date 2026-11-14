const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
exports.run=async({evaluate,navigate,click,input,until,send,root})=>{
 const {loadSource}=require('./load-source.cjs'),demo=loadSource('tests/fixtures/legacy-workspace');
 const {restoreWorkspace}=loadSource('lib/workspace');
 const legacy=restoreWorkspace(JSON.stringify({invoices:demo.invoices,documents:demo.documents}),{...demo,selectedCompanyId:demo.companies[0].id,settings:{}});
 // Only this isolated test profile receives synthetic fixture data.
 const original=JSON.stringify(legacy);
 await evaluate(`localStorage.setItem('vet-the-vat-workspace-v1',${JSON.stringify(original)})`);
 await navigate('/app/dashboard','Legacy records need your review');
 assert.equal(await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")'),original);
 await navigate('/app/dashboard','Legacy records need your review');
 legacy.invoices[0]={...legacy.invoices[0],notes:'Synthetic genuine edit'};
 await evaluate(`localStorage.setItem('vet-the-vat-workspace-v1',${JSON.stringify(JSON.stringify(legacy))})`);
 await navigate('/app/dashboard','Legacy records need your review');
 assert.ok(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.some(row=>row.notes==="Synthetic genuine edit")'));
 await navigate('/app/dashboard','Legacy records need your review');
 assert.ok(await evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1")).invoices.some(row=>row.notes==="Synthetic genuine edit")'));
 const screenshotDir=path.join(root,'docs/previews/frontend-corrections');fs.mkdirSync(screenshotDir,{recursive:true});
 for(const width of [320,390,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  for(const route of ['/pricing','/app/subscription']){
   await navigate(route,route==='/pricing'?'Simple pricing':'Subscription and usage');
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),route+' overflow '+width);
   for(const text of ['£9','£15','£25','£5','£14','Optional · £5/month','Recommended','90 days','180 days','Unlimited','20 invoice creations'])assert.ok(await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`),text);
   assert.equal(await evaluate('document.querySelectorAll("input[autocomplete=cc-number]").length'),0);
   const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
   fs.writeFileSync(path.join(screenshotDir,(route==='/pricing'?'pricing':'subscription')+'-'+width+'.png'),Buffer.from(capture.data,'base64'));
  }
 }
 const before=await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")');
 await evaluate('[...document.querySelectorAll("label")].find(row=>row.textContent.includes("Compare Basic with ORS")).querySelector("input").click()');
 await until('document.body.innerText.includes("Comparison total: £14/month. No access activated.")','Basic ORS comparison');
 assert.equal(await evaluate('localStorage.getItem("vet-the-vat-workspace-v1")'),before);
 assert.equal(await evaluate('document.querySelectorAll("input[type=date],select").length'),0);
 await navigate('/app/subscription','Subscription and usage');
 await click('View Starter details');await until('document.body.innerText.includes("Starter plan information")','plan detail');await click('Close details');
 console.log('PASS corrections: empty startup, read-only legacy preservation, edited record preservation/review after reload, shared pricing/trial/ORS/history, responsive 320/390/768/1440 screenshots');
};

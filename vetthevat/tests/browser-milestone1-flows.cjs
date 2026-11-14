const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
exports.run = async ({evaluate,navigate,click,input,select,until,send,delay,temp,detailRoute,dialogs,setDialogAcceptance}) => {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/app/invoices','Invoices');
  await select('Workspace company','company-demo-business');
  const snapshotDir=path.resolve(__dirname,'../docs/previews/milestone-1');fs.mkdirSync(snapshotDir,{recursive:true});
  const screenshot=async(name)=>{ await evaluate('window.scrollTo({top:0,behavior:"instant"})'); await delay(100); const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(snapshotDir,name+'.png'),Buffer.from(result.data,'base64')); };
  for(const route of ['/app/invoices','/app/invoices/new','/app/invoices/upload']) {
    await navigate(route,route.endsWith('/new')?'Invoice details':route.endsWith('/upload')?'Upload a supplier invoice':'Invoices');
    assert.equal(await evaluate('document.querySelectorAll("aside nav a[aria-current=page]").length'),1);
    assert.equal(await evaluate('Boolean(document.querySelector("nav a[href=\\"/app/admin\\"]"))'),false);
  }
  await evaluate('document.querySelector("button[aria-label=\\"ORS unavailable\\"]").focus();document.querySelector("button[aria-label=\\"ORS unavailable\\"]").click()');
  await until('Boolean(document.querySelector("[role=dialog]"))','mode dialog');
  assert.ok(await evaluate('document.querySelector("[role=dialog]").innerText.includes("No access is granted")'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
  assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),'modal focus');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  await until('!document.querySelector("[role=dialog]")','escape closes dialog');
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'ORS unavailable');
  await navigate('/app/invoices/new','Invoice details');await input('Supplier name','Unsaved synthetic');
  setDialogAcceptance(false);
  const count=dialogs.length;
  await evaluate('document.querySelector("aside a[href=\\"/app/invoices\\"]").click()');await delay(300);
  assert.equal(await evaluate('location.pathname'),'/app/invoices/new');assert.ok(dialogs.length>count);
  await select('Workspace company','company-retail');
  assert.equal(await evaluate('document.querySelector("header select").value'),'company-demo-business');
  await click('Cancel');assert.equal(await evaluate('location.pathname'),'/app/invoices/new');
  setDialogAcceptance(true);
  await click('Cancel');await until('location.pathname==="/app/invoices"','approved discard');
  await evaluate('document.querySelector("aside a[href=\\"/app/invoices/new\\"]").click()');await until('location.pathname.endsWith("/new")','client navigation');
  await input('Supplier name','History synthetic');setDialogAcceptance(false);
  await evaluate('history.back()');await delay(700);
  assert.equal(await evaluate('location.pathname'),'/app/invoices/new');
  assert.equal(await evaluate('document.querySelector("input[aria-invalid]").value'),'History synthetic');
  setDialogAcceptance(true);await click('Cancel');
  console.log('PASS one active nav, admin absent, honest ORS, modal focus/escape, dirty link/company/cancel/history protection');
  await navigate(detailRoute,'BROWSER-TEST-123');
  const downloads=path.join(temp,'milestone-downloads');fs.mkdirSync(downloads);
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads},null);
  await click('Export Excel');
  for(let i=0;i<60&&!fs.readdirSync(downloads).some(name=>name.endsWith('.xlsx'));i++)await delay(200);
  const file=fs.readdirSync(downloads).find(name=>name.endsWith('.xlsx'));assert.ok(file,'detail workbook downloaded');
  const workbook=XLSX.readFile(path.join(downloads,file));
  assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets['VAT Transactions']).length,1,'detail workbook has one invoice row');
  const contents=workbook.SheetNames.map(name=>XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n');
  assert.ok(contents.includes('BROWSER-TEST-123'));assert.ok(!contents.includes('OCR-TEST-789'),'another invoice leaked into detail export');
  console.log('PASS detail Excel download contains only the displayed invoice');
  await navigate('/app/invoices','Invoices');
  await evaluate(`(() => {const data=JSON.parse(localStorage.getItem('vet-the-vat-workspace-v1'));const template=data.invoices.find(row=>row.invoiceNumber==='BROWSER-TEST-123');data.invoices=data.invoices.filter(row=>!row.invoiceNumber.startsWith('PAGE-'));for(let i=0;i<45;i++)data.invoices.push({...template,id:'synthetic-page-'+i,invoiceNumber:'PAGE-'+String(i).padStart(3,'0')});localStorage.setItem('vet-the-vat-workspace-v1',JSON.stringify(data));})()`);
  await navigate('/app/invoices','Invoices');await input('Search invoices','PAGE-');
  assert.equal(await evaluate('document.querySelectorAll("main tbody tr").length'),20);await click('Next');
  assert.ok(await evaluate('document.body.innerText.includes("Page 2 of 3")'));
  await evaluate('[...document.querySelectorAll("th button")].find(item=>item.textContent.trim()==="Invoice").click()');
  assert.equal(await evaluate('document.querySelector("main tbody tr a").textContent'),'PAGE-000');
  assert.ok(await evaluate('Boolean(document.querySelector("th[aria-sort=ascending]"))'));
  await screenshot('desktop-invoices');
  await navigate('/app/dashboard','Dashboard');await screenshot('desktop-dashboard');
  for(const width of [320,390,768,1024,1440]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    for(const [route,text] of [['/app/dashboard','Dashboard'],['/app/invoices','Invoices'],['/app/invoices/new','Invoice details'],['/app/invoices/upload','Upload a supplier invoice']]) {
      await navigate(route,text);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),route+' overflow at '+width);
      if(width<768)assert.ok(await evaluate('document.querySelector("button[aria-label=\\"Product mode information\\"]").getBoundingClientRect().height >= 24'),'mode target size');
      if(width===390)await screenshot('mobile-'+route.split('/').pop());
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await navigate(detailRoute,'BROWSER-TEST-123');await click('Edit');
  await click('Source document');assert.ok(await evaluate('document.body.innerText.includes("No original attached")'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});
  assert.ok(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent==="Review fields"'));
  await click('Cancel');
  await navigate('/app/invoices/new','Invoice details');
  await evaluate('document.querySelector("button[aria-label=\\"Open navigation\\"]").focus();document.querySelector("button[aria-label=\\"Open navigation\\"]").click()');
  await until('Boolean(document.querySelector("[role=dialog]"))','mobile drawer');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
  assert.ok(await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Open navigation');
  await click('Confirm & Save Invoice');
  assert.equal(await evaluate('document.activeElement.getAttribute("role")'),'alert');
  assert.ok(await evaluate('Boolean(document.querySelector("input[aria-invalid=true]"))'));
  console.log('PASS sorting, 20-row pagination, 320/390/768/1024/1440 widths, drawer keyboard/focus and validation focus');
  console.log('Synthetic preview screenshots: '+snapshotDir);
};



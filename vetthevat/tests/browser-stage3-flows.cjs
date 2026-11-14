const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
exports.run = async ({evaluate,navigate,click,input,select,until,upload,send,delay,temp}) => {
  const data = () => evaluate('JSON.parse(localStorage.getItem("vet-the-vat-workspace-v1"))');
  await navigate('/app/pos','POS invoice');
  await input('Supplier name','Synthetic POS Supplier');await input('Invoice number','POS-STAGE3');await input('Invoice date','2026-10-15');
  await input('Line 1 description','Discounted item');await input('Line 1 quantity','3');await input('Line 1 unitPrice','0.335');await input('Line 1 discount','0.01');await input('Line 1 vatRate','0');
  await evaluate(`(() => {const el=[...document.querySelectorAll('label')].find(x=>x.firstChild.textContent==='Payment').querySelector('select');el.value='Card';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click('Save Draft');await until('location.pathname.includes("/app/invoices/")','POS draft');
  const posRoute=await evaluate('location.pathname');await navigate(posRoute,'POS-STAGE3');await click('Edit');await click('Confirm & Save Invoice');await until('document.body.innerText.includes("Review & Confirm")','POS confirm');
  const pos=(await data()).invoices.find(x=>x.invoiceNumber==='POS-STAGE3');assert.equal(pos.paymentStatus,'Card');assert.equal(pos.subtotal,1);assert.equal(pos.vatAmount,0);assert.equal(pos.totalAmount,1);
  await navigate('/app/invoices/new','Invoice details');await input('Supplier name','Synthetic POS Supplier');await input('Invoice number','POS-STAGE3');await input('Invoice date','2026-10-15');await input('Line 1 description','Duplicate');await input('Line 1 unitPrice','1');await click('Confirm & Save Invoice');await until('document.querySelector("[role=alert]")?.textContent.includes("already exists")','duplicate block');assert.equal((await data()).invoices.filter(x=>x.invoiceNumber==='POS-STAGE3').length,1);
  console.log('PASS POS draft/reopen/confirm, card payment, fractional price, discount and zero VAT; duplicate confirmation blocked');

  await navigate('/app/invoices','Invoices');
  const search=async q=>{await input('Workspace invoice search',q);await evaluate('document.querySelector("header form").requestSubmit()');await until(`location.search.includes(${JSON.stringify(q)}) && document.querySelector('input[placeholder="Search supplier, invoice number or document"]').value===${JSON.stringify(q)}`,'reactive header search');};
  await search('POS-STAGE3');await until('document.querySelector("tbody").innerText.includes("POS-STAGE3")','first search');await search('BROWSER-TEST-123');await until('document.querySelector("tbody").innerText.includes("BROWSER-TEST-123")','second search');assert.ok(!(await evaluate('document.querySelector("tbody").innerText')).includes('POS-STAGE3'));
  console.log('PASS consecutive header searches on the mounted invoice route update results');

  await navigate('/app/companies','Companies');await click('Add Company');
  await evaluate(`document.querySelector('[role=dialog] button:last-child').focus()`);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate('document.activeElement===document.querySelector("[role=dialog] input")'),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});assert.equal(await evaluate('document.activeElement===document.querySelector("[role=dialog] button:last-child")'),true);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!document.querySelector("[role=dialog]")','Escape closes');assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Add Company');
  console.log('PASS modal Tab/Shift+Tab containment, Escape and trigger focus restoration');

  await navigate('/app/invoices/upload','Upload a supplier invoice');
  await upload(path.join(temp,'invoice.png'));await until('[...document.querySelectorAll("button")].some(x=>x.textContent.trim()==="Stop reading")','OCR cancellation control');await click('Stop reading');await until('document.querySelector("[role=alert]")?.textContent.includes("Reading stopped")','reading cancellation');
  await click('Retry extraction');await until('document.body.innerText.includes("Text extraction finished")','real retry',130000);await click('Process Document');await until('document.body.innerText.includes("Review extracted invoice")','repeated-upload review');await evaluate(`[...document.querySelectorAll('label')].find(x=>x.textContent.includes('I have compared the fields')).querySelector('input').click()`);await click('Confirm & Save Invoice');await until('document.querySelector("[role=alert]")?.textContent.includes("already exists")','repeated document duplicate');
  assert.equal((await data()).invoices.filter(x=>x.invoiceNumber==='OCR-TEST-789').length,1);
  console.log('PASS real OCR stop/retry and repeated upload blocked at confirmation');

  const original=(await data()).documents.find(x=>x.fileName==='digital.pdf'&&x.associatedInvoiceId);
  await evaluate(`(() => {const s=JSON.parse(localStorage.getItem('vet-the-vat-workspace-v1'));const url=URL.createObjectURL(new Blob(['synthetic']));URL.revokeObjectURL(url);s.documents.find(x=>x.id===${JSON.stringify(original.id)}).localPreviewUrl=url;localStorage.setItem('vet-the-vat-workspace-v1',JSON.stringify(s));})()`);
  await navigate('/app/documents/'+original.id,'Original preview unavailable');assert.equal(await evaluate('document.querySelector("button[aria-label=Download]").disabled'),true);
  const mismatchDir=path.join(temp,'mismatch');fs.mkdirSync(mismatchDir);const mismatch=path.join(mismatchDir,'digital.pdf');const bytes=fs.readFileSync(path.join(temp,'digital.pdf'));bytes[bytes.length-1]^=1;fs.writeFileSync(mismatch,bytes);
  await upload(mismatch);await until('document.querySelector("[role=alert]")?.textContent.includes("checksum")','checksum rejection');assert.equal(await evaluate('document.querySelector("button[aria-label=Download]").disabled'),true);
  await upload(path.join(temp,'digital.pdf'));await until('!document.querySelector("button[aria-label=Download]").disabled','matching recovery');
  const downloads=path.join(temp,'stage3-downloads');fs.mkdirSync(downloads);
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads},null);await evaluate('document.querySelector("button[aria-label=Download]").click()');
  for(let i=0;i<60&&!fs.existsSync(path.join(downloads,'digital.pdf'));i++)await delay(100);
  assert.deepEqual(fs.readFileSync(path.join(downloads,'digital.pdf')),fs.readFileSync(path.join(temp,'digital.pdf')));
  assert.ok(await evaluate('document.querySelector("iframe").src.startsWith("blob:")'));
  console.log('PASS expired blob disables preview actions; same-name/size checksum mismatch rejected; matching original restores preview and downloaded bytes match');

  await evaluate(`(() => {const s=JSON.parse(localStorage.getItem('vet-the-vat-workspace-v1'));const base=s.invoices.find(x=>x.invoiceNumber==='POS-STAGE3');for(let i=0;i<45;i++)s.invoices.push({...base,id:'synthetic-page-'+i,invoiceNumber:'PAGE-'+String(i).padStart(3,'0')});localStorage.setItem('vet-the-vat-workspace-v1',JSON.stringify(s));})()`);
  await navigate('/app/invoices?query=PAGE-','Invoices');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),20);await select('Sort invoices','number');await click('Next');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),20);await click('Next');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),5);await click('Previous');assert.equal(await evaluate('document.querySelectorAll("tbody tr").length'),20);
  console.log('PASS 45 synthetic records: invoice-number sorting and 20/20/5 pagination');
  for(const route of ['/','/about','/product','/benefits','/features','/how-it-works','/mobile-app','/pricing','/faq','/contact','/support','/security','/privacy','/terms','/login','/register','/forgot-password','/reset-password','/verify-email','/onboarding']) {
    assert.equal((await fetch('http://127.0.0.1:3197'+route)).status,200);
    await send('Page.navigate',{url:'http://127.0.0.1:3197'+route});await until(`location.pathname===${JSON.stringify(route)} && Boolean(document.querySelector('h1'))`,'public/account route '+route);await delay(300);assert.ok(await evaluate('document.querySelector("h1").textContent.length>0'));
  }
  console.log('PASS public/account routes render; this does not verify external authentication, legal content or contact delivery');
};


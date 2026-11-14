const fs=require('node:fs'),path=require('node:path');
const {assert,crypto,operator,provision,verify}=require('./saas-services.cjs');
exports.run=async({evaluate,navigate,send,until,click,input,root})=>{
 const account=await provision('analytics-auto');await verify(account);
 await navigate('/login','Sign in');await input('Email',account.email);await input('Password',account.password);await click('Sign in');await until('location.pathname==="/app/dashboard"&&document.body.innerText.includes("Sign out")','synthetic account login');
 await navigate('/app/companies','Company setup');await until('!document.querySelector("input[name=name]")?.disabled','onboarding feature gate');await input('Company name','Synthetic Analytics Auto Load');await click('Set up company');await until('location.pathname.startsWith("/app/")&&document.body.innerText.includes("Synthetic Analytics Auto Load")','company created');
 await navigate('/app/dashboard','Business analytics');await until('document.querySelector("[data-metric=invoiceCount]")','automatic analytics response');assert.equal(await evaluate('document.body.innerText.includes("Load analytics")'),false,'initial analytics has no manual load action');
 const companyId=await evaluate('document.querySelector("#server-company")?.value||""'),start=await evaluate('document.querySelector("input[name=startsOn]")?.value||""'),end=await evaluate('document.querySelector("input[name=endsOn]")?.value||""');assert.ok(companyId&&start&&end,'company and date filters rendered');
 const actual=await operator(async db=>(await db.query("SELECT count(*)::int AS n FROM business.invoices WHERE company_id=$1 AND state='confirmed' AND issued_on BETWEEN $2::date AND $3::date AND currency='GBP'",[companyId,start,end])).rows[0].n);
 assert.equal(Number(await evaluate('document.querySelector("[data-metric=invoiceCount]")?.textContent')),actual,'auto-loaded confirmed invoice count reconciles to PostgreSQL');
 const screenshots=path.join(root,'docs/previews/vat-ors-audit');fs.mkdirSync(screenshots,{recursive:true});fs.writeFileSync(path.join(screenshots,'vat-analytics-auto-load.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await input('From','2026-10-01');await until('document.body.innerText.includes("Loaded 2026-10-01")','date filter automatically refreshes');
 fs.writeFileSync(path.join(screenshots,'vat-analytics-filter-refresh.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 console.log('PASS real Chrome analytics: initial auto-load, no manual Load action, date filter auto-refresh, confirmed invoice count reconciled with PostgreSQL; synthetic company only.');
};

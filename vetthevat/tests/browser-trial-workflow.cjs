const fs=require('node:fs');
const {assert,crypto,provision,verify,operator,companyFor}=require('./saas-services.cjs');

exports.run=async({evaluate,navigate,until,click,input,select,send,temp})=>{
 const chooseLocale=async(code,label)=>{await evaluate(`(()=>{const trigger=document.querySelector('[data-global-language-switcher] button[aria-haspopup=menu]');if(!trigger)throw Error('language trigger unavailable');trigger.click()})()`);await until('document.querySelectorAll("[role=menuitemradio]").length>0','language menu opened');await evaluate(`(()=>{const item=document.querySelector('[role=menuitemradio][data-locale="'+${JSON.stringify(code)}+'"]');if(!item)throw Error('missing language option '+${JSON.stringify(label)});item.click()})()`);await until(`document.documentElement.lang===${JSON.stringify(code)}`,'language selection applied');};
 const account=await provision('browser-trial');
 await verify(account);
 await navigate('/login','Sign in');
 await input('Email',account.email);
 await input('Password',account.password);
 await click('Sign in');
 await until('location.pathname==="/app/dashboard"','verified browser login');

 await navigate('/app/companies','Company setup');
 await until('Boolean(document.querySelector("input[name=name]:not(:disabled)"))','reviewed onboarding form enabled');
 await input('Company name','Browser automatic trial acceptance');
 const before=await evaluate('({path:location.pathname,name:document.querySelector("input[name=name]").value,company:document.querySelector("#server-company")?.value||""})');
 await chooseLocale('hi-IN','');
 assert.deepEqual(await evaluate('({path:location.pathname,name:document.querySelector("input[name=name]").value,company:document.querySelector("#server-company")?.value||""})'),before,'language switch preserves current route, company context and unsaved form value');
 await evaluate('document.querySelector("input[name=name]")?.closest("form")?.requestSubmit()');
 await until('location.pathname==="/app/dashboard" && document.body.innerText.includes("Browser automatic trial acceptance")','onboarding redirects into created company');

 const rows=await operator(async db=>(await db.query(`SELECT u.id::text user_id,c.id::text company_id,c.owner_id::text company_owner,m.role,m.status membership_status,
  cp.status profile_status,a.id::text account_id,a.owner_id::text account_owner,e.plan,e.status entitlement_status,e.invoices_per_month,e.company_limit,e.seat_limit,e.ors_enabled,e.trial_started_at,e.trial_expires_at,e.trial_status,h.status history_status,extract(epoch from (h.expires_at-h.started_at))::int duration_seconds
  FROM web_auth.users u JOIN web_auth.companies c ON c.owner_id=u.id AND c.name='Browser automatic trial acceptance'
  JOIN web_auth.company_memberships m ON m.company_id=c.id AND m.user_id=u.id JOIN saas.company_profiles cp ON cp.company_id=c.id
  JOIN saas.billing_accounts a ON a.id=cp.account_id JOIN saas.subscription_entitlements e ON e.account_id=a.id JOIN saas.trial_history h ON h.account_id=a.id WHERE u.email=$1`,[account.email])).rows[0]);
 assert.ok(rows,'browser-created company, owner and trial records persisted');
 assert.equal(rows.company_owner,rows.user_id);assert.equal(rows.account_owner,rows.user_id);assert.equal(rows.role,'Owner');assert.equal(rows.membership_status,'active');
 assert.equal(rows.profile_status,'active');assert.equal(rows.plan,'Starter');assert.equal(rows.entitlement_status,'active');assert.equal(rows.trial_status,'active');assert.equal(rows.history_status,'active');
 assert.equal(rows.invoices_per_month,100);assert.equal(rows.company_limit,2);assert.equal(rows.seat_limit,4);assert.equal(rows.ors_enabled,true);assert.equal(rows.duration_seconds,14*24*60*60);
 assert.equal(await evaluate('document.documentElement.lang'),'hi-IN','locale choice persisted across authenticated navigation');

 const nav=async(route)=>{await evaluate(`(()=>{const a=[...document.querySelectorAll('a')].find(x=>new URL(x.href).pathname===${JSON.stringify(route)});if(!a)throw Error('missing navigation route '+${JSON.stringify(route)});a.click()})()`);await until(`location.pathname===${JSON.stringify(route)} && Boolean(document.querySelector('.workspace'))`,route+' navigation');};
 await nav('/app/dashboard');assert.equal(await evaluate('document.documentElement.lang'),'hi-IN');
 await nav('/app/ors');assert.equal(await evaluate('document.documentElement.lang'),'hi-IN');
 await chooseLocale('en-GB','');
 await navigate('/app/vat','VAT overview');
 const foreignUser=await provision('browser-trial-foreign');
 const foreignCompany=await companyFor(foreignUser.userId);
 const tenantProbe=await evaluate(`(async()=>{const r=await fetch('/api/ors/catalogue',{headers:{'x-company-id':${JSON.stringify(foreignCompany)},'cache':'no-store'}});return r.status})()`);
 assert.equal(tenantProbe,403,'another tenant cannot be read by this signed-in browser session');

 const duplicate=await evaluate(`(async()=>{const auth=await(await fetch('/api/auth/session',{cache:'no-store'})).json(),r=await fetch('/api/account/companies',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':auth.csrfToken,'idempotency-key':crypto.randomUUID()},body:JSON.stringify({name:'Duplicate trial attempt',currency:'GBP',accountId:null})});return r.status;})()`);
 assert.equal(duplicate,409,'a second first-company trial is rejected');
 assert.equal(await operator(async db=>(await db.query('SELECT count(*)::int n FROM saas.trial_history WHERE actor_id=$1',[rows.user_id])).rows[0].n),1,'one trial history per verified identity');

 await operator(db=>db.query(`WITH expired_trial AS (SELECT clock_timestamp()-interval '15 days' AS started_at) UPDATE saas.subscription_entitlements e SET trial_started_at=x.started_at,trial_expires_at=x.started_at+interval '14 days' FROM expired_trial x WHERE e.account_id=$1`,[rows.account_id]));
 await navigate('/app/companies','Company setup');
 await until('document.body.innerText.includes("Trial status: Expired")','expired trial status rendered after server refresh');
 const expired=await operator(async db=>(await db.query(`SELECT e.trial_status,h.status history_status FROM saas.subscription_entitlements e JOIN saas.trial_history h ON h.account_id=e.account_id WHERE e.account_id=$1`,[rows.account_id])).rows[0]);
 assert.equal(expired.trial_status,'expired');assert.equal(expired.history_status,'expired');
 const rejected=await evaluate(`(async()=>{const auth=await(await fetch('/api/auth/session',{cache:'no-store'})).json(),r=await fetch('/api/account/companies',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':auth.csrfToken,'idempotency-key':crypto.randomUUID()},body:JSON.stringify({name:'Company after expired trial',currency:'GBP',accountId:${JSON.stringify(rows.account_id)}})});return r.status;})()`);
 assert.equal(rejected,403,'expired trial cannot provision an additional company');

 await chooseLocale('ar','');await send('Page.reload');
 await until('document.readyState==="complete" && document.documentElement.lang==="ar" && document.documentElement.dir==="rtl"','Arabic preference survives refresh with RTL attributes');
 const arabicTrialCard=await evaluate('document.querySelector(".bg-orange-50")?.innerText.trim()||""');assert.ok(arabicTrialCard.length>10&&/\p{Script=Arabic}/u.test(arabicTrialCard),'localized trial status remains visible in Arabic RTL workspace');
 const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(require('node:path').join(temp,'arabic-rtl-desktop.png'),Buffer.from(desktop.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(require('node:path').join(temp,'arabic-rtl-mobile.png'),Buffer.from(mobile.data,'base64'));
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Arabic RTL workspace has no horizontal overflow at 390px');
 await evaluate('document.querySelector("[data-testid=authenticated-sign-out]")?.click()');
 await navigate('/login','Sign in');
 await input('Email',account.email);await input('Password',account.password);await evaluate('document.querySelector("input[name=email]")?.closest("form")?.querySelector("button[type=submit]")?.click()');
 await until('location.pathname==="/app/dashboard" && document.documentElement.lang==="ar" && document.documentElement.dir==="rtl"','locale persists after logout and login');
 console.log('PASS browser trial/onboarding: signup, local email verification, login, ownership/membership, automatic 14-day trial, VAT and ORS routes, cross-tenant denial, duplicate prevention, expiry, refresh persistence, Arabic RTL desktop/mobile attributes and overflow.');
};

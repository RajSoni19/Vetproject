const {assert,fs,path,crypto,operator,accountToken,application}=require('./pg-auth-services.cjs');
exports.run=async({evaluate,navigate,send,root,until,click,input,delay})=>{
 await operator(db=>db.query('DELETE FROM web_auth.rate_limits'));
 const shots=path.join(root,'docs/previews/postgresql-auth');fs.mkdirSync(shots,{recursive:true});const results=[];
 for(const width of [1440,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
  const account={email:'browser-'+crypto.randomUUID()+'@example.test',password:crypto.randomBytes(24).toString('base64url')};
  await navigate('/register','Create your account');await input('Full name','Isolated Browser Test');await input('Email',account.email);await input('Password',account.password);await click('Create account');await until('document.body.innerText.includes("If the account can be created")','registration saved');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'registration overflow');
  await navigate('/verify-email?token='+await accountToken(account.email),'Verify your email');await click('Confirm email verification');await until('document.body.innerText.includes("Your email is verified")','email verification');
  await navigate('/login','Sign in');await input('Email',account.email);await input('Password','incorrect-password-test');await click('Sign in');await until('document.querySelector("[role=alert]")?.innerText.includes("Unable to sign in")','incorrect password');await input('Password',account.password);await click('Sign in');
  await until('location.pathname==="/app/dashboard" && document.body.innerText.includes("Sign out")','password login redirect');await until('document.body.innerText.includes("Create your company workspace")','empty workspace');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'workspace overflow');
  assert.equal(await evaluate('document.cookie.includes("vetthevat-session")'),false,'HttpOnly cookie invisible');
  assert.equal(await evaluate('Object.keys(localStorage).some(k=>/firebase|authToken|idToken|refreshToken|isAuthenticated/.test(k))'),false);
  assert.equal(await evaluate('Array.from(document.links).some(a=>a.getAttribute("href")==="/app/admin")'),false,'No admin navigation');
  // Legacy records are deliberately not imported into authenticated accounts.
  await evaluate('localStorage.setItem("vet-the-vat-workspace-v1",JSON.stringify({invoices:[{id:"legacy-ownership-sentinel"}],companies:[{id:"legacy-company"}]}))');
  await send('Page.reload');await until('document.body.innerText.includes("Create your company workspace")','refresh preserves session and blocks legacy records');
  // Explicit test-user action, never an authentication seed or auto-company.
  await click('Add your company');await input('Company name','Isolated Browser Workspace '+width);await click('Save locally');
  await until('Boolean(document.querySelector(".workspace"))&&!document.body.innerText.includes("Create your company workspace")','existing dashboard module');
  for(const route of ['/app/invoices','/app/invoices/upload','/app/customers','/app/suppliers','/app/banking','/app/reports','/app/ors','/app/settings','/app/subscription']){
   await navigate(route,'Sign out');assert.equal(await evaluate('location.pathname'),route);assert.equal(await evaluate('document.body.innerText.includes("legacy-ownership-sentinel")'),false);
   await until('Boolean(document.querySelector(".workspace"))&&!document.body.innerText.includes("Create your company workspace")','business module '+route);
   if(route==='/app/settings'){await click('Security');await until('document.body.innerText.includes("Your active web sessions")','session settings');await until('document.body.innerText.includes("Current session")','real session inventory');}
  }
  await navigate('/app/dashboard','Sign out');
  fs.writeFileSync(path.join(shots,'authenticated-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  await click('Sign out');await until('location.pathname==="/login"&&document.body.innerText.includes("signed out securely")','logout');
  await navigate('/app/dashboard','Sign in');assert.equal(await evaluate('location.pathname'),'/login');
  await navigate('/forgot-password','Reset your password');await input('Email',account.email);await click('Send reset instructions');await until('document.body.innerText.includes("If the address is eligible")','forgot password');
  await navigate('/reset-password?token='+await accountToken(account.email,'reset_password'),'Choose a new password');account.password=crypto.randomBytes(24).toString('base64url');await input('New password',account.password);await click('Reset password');await until('document.body.innerText.includes("Previous sessions have been revoked")','password reset');
  await navigate('/login','Sign in');await input('Email',account.email);await input('Password',account.password);await click('Sign in');await until('location.pathname==="/app/dashboard"&&document.body.innerText.includes("Sign out")','new password login');
  await operator(db=>db.query("UPDATE web_auth.sessions SET revoked_at=now() WHERE user_id=(SELECT id FROM web_auth.users WHERE email=$1)",[account.email]));await send('Page.reload');await until('location.pathname==="/login"','revocation on refresh');
  for(const route of ['/','/about','/features','/pricing','/contact','/support','/get-started','/privacy','/terms'])assert.equal((await application(route)).status,200,route);
  await navigate('/login','Sign in');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'login overflow');
  fs.writeFileSync(path.join(shots,'login-'+width+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
  results.push({width,registration:'real PostgreSQL',verification:'one-use link from encrypted test outbox',login:'password',privateNavigation:'actual business modules rendered after explicit local test-company creation; no financial records',sessionManagement:'real own-session inventory rendered',refresh:'passed',logout:'revoked',passwordReset:'passed',revokedRefresh:'denied',legacyData:'not imported'});
 }
 fs.writeFileSync(path.join(root,'.auth-pg/browser-results.json'),JSON.stringify(results,null,2));console.log('PASS real PostgreSQL Chrome flow at desktop and mobile widths; no real email or administrator.');
};

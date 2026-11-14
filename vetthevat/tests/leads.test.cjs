const test=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const fs=require('node:fs');const {loadSource}=require('./load-source.cjs');
const {validateLead,LeadValidationError}=loadSource('lib/leads/contracts');
const {createPublicLeadHandler,receipt,verifyReceipt,LeadError}=loadSource('lib/server/leads/core');
const {readLeadConfiguration}=loadSource('lib/server/leads/config');
const {postgresLeadStore}=loadSource('lib/server/leads/postgres');
const {turnstileVerifier,smtpLeadMailer,notificationEmail,processOneLeadNotification}=loadSource('lib/server/leads/providers');
const {adminLeadHandler}=loadSource('lib/server/leads/admin-core');
const {leadWorkerHandler}=loadSource('lib/server/leads/worker');
const origin='https://leads.example.test',secret='a'.repeat(64),receiptSecret='b'.repeat(64);
const lead={fullName:'Synthetic Enquirer',email:'enquirer@example.test',phone:'+44 7700 900123',businessName:'Synthetic Business',service:'VAT + ORS',requirements:'Synthetic requirements only',consent:true};
function fixture(){
 let tail=Promise.resolve(),state={leads:[],keys:[],outbox:[]},failOutbox=false;
 // A SERIALIZED TRANSACTION DOUBLE, not actual PostgreSQL durability/RLS/locks.
 // The actual repository SQL is executed against this explicit contract model.
 const database={transaction(work){const pending=tail.then(async()=>{const next=structuredClone(state);const result=await work({query:async(sql,values=[])=>{
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.startsWith('SELECT k.digest')){const key=next.keys.find(row=>row.key===values[0]);const row=key&&next.leads.find(row=>row.id===key.id);return {rows:row?[{...row,digest:key.digest}]:[]};}
  if(sql.startsWith('SELECT id,created_at'))return {rows:next.leads.filter(row=>row.duplicate===values[0]).slice(-1)};
  if(sql.startsWith('INSERT INTO lead_intake.leads')){const row={id:values[0],payload:JSON.parse(values[1]),duplicate:values[2],created_at:new Date().toISOString()};next.leads.push(row);return {rows:[row]};}
  if(sql.startsWith('INSERT INTO lead_intake.outbox')){if(failOutbox)throw Error('synthetic outbox storage failure');next.outbox.push({id:values[0],leadId:values[1]});return {rows:[]};}
  if(sql.startsWith('INSERT INTO lead_intake.idempotency')){next.keys.push({key:values[0],digest:values[1],id:values[2]});return {rows:[]};}
  throw Error('Unexpected synthetic SQL');
 }});state=next;return result;});tail=pending.catch(()=>{});return pending;}};
 const store=postgresLeadStore(database),deps={origin,secret,receiptSecret,store:{...store,consume:async()=>({allowed:true,retryAfter:0})},verifyBot:async()=>true,networkKey:()=> 'synthetic-network'};
 return {deps,store,get state(){return state},set failOutbox(value){failOutbox=value}};
}
function request(data={...lead,turnstileToken:'synthetic-token',website:''},key=randomUUID(),headers={}){return new Request(origin+'/api/public/leads',{method:'POST',headers:{origin,'sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':key,...headers},body:JSON.stringify(data)});}

test('lead validation normalizes inputs and rejects missing consent, invalid emails, phone, lengths and extra recipient',()=>{
 const normalized=validateLead({...lead,fullName:'  Synthetic   Enquirer ',email:'ENQUIRER@EXAMPLE.TEST'});assert.equal(normalized.fullName,lead.fullName);assert.equal(normalized.email,lead.email);
 for(const fields of [{consent:false},{phone:'123'},{email:'not-an-email'},{fullName:'x'.repeat(121)},{businessName:''},{requirements:'x'.repeat(3001)},{email:'inject\r\nBcc:evil@example.test'},{service:'Admin'},{recipient:'attacker@example.test'}])assert.throws(()=>validateLead({...lead,...fields}),LeadValidationError);
 assert.equal(validateLead({...lead,requirements:'<script>unsafe-looking text</script>'}).requirements,'<script>unsafe-looking text</script>');
});
test('unconfigured public intake fails closed; GET cannot expose leads',async()=>{
 assert.equal((await createPublicLeadHandler(undefined)(request())).status,503);
 assert.equal((await createPublicLeadHandler(fixture().deps)(new Request(origin+'/api/public/leads'))).status,405);
});
test('valid lead and notification intent commit together, response reveals no PII, receipt is signed',async()=>{
 const f=fixture(),response=await createPublicLeadHandler(f.deps)(request());assert.equal(response.status,200);assert.equal(f.state.leads.length,1);assert.equal(f.state.outbox.length,1);
 const result=await response.json();assert.equal(result.received,true);assert.ok(!JSON.stringify(result).includes(lead.email));
 const value=response.headers.get('set-cookie').split(';')[0].split('=')[1];assert.equal(verifyReceipt(value,receiptSecret),result.reference);assert.ok(response.headers.get('set-cookie').includes('HttpOnly; Secure; SameSite=Lax'));assert.equal(response.headers.get('cache-control'),'no-store');
});
test('concurrent same-key and new-key duplicate submissions save one lead and one outbox intent',async()=>{
 const f=fixture(),handler=createPublicLeadHandler(f.deps),key=randomUUID();
 const responses=await Promise.all(Array.from({length:20},(_,i)=>handler(request(undefined,i<10?key:randomUUID()))));
 for(const response of responses)assert.equal(response.status,200);
 assert.equal(f.state.leads.length,1);assert.equal(f.state.outbox.length,1);assert.equal(new Set(await Promise.all(responses.map(async response=>(await response.json()).reference))).size,1);
 const changed=await handler(request({...lead,requirements:'changed',turnstileToken:'synthetic-token',website:''},key));assert.equal(changed.status,409);assert.equal(f.state.leads.length,1);
});
test('outbox failure rolls back lead and key: never confirms unsaved lead',async()=>{
 const f=fixture();f.failOutbox=true;const key=randomUUID();const response=await createPublicLeadHandler(f.deps)(request(undefined,key));assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.equal(f.state.leads.length,0);assert.equal(f.state.keys.length,0);
 f.failOutbox=false;assert.equal((await createPublicLeadHandler(f.deps)(request(undefined,key))).status,200);assert.equal(f.state.leads.length,1);
});
test('invalid input, honeypot, failed bot, wrong origin and oversized bodies never save leads',async()=>{
 const f=fixture(),handler=createPublicLeadHandler(f.deps);
 for(const body of [{...lead,consent:false,turnstileToken:'t',website:''},{...lead,turnstileToken:'t',website:'bot'},{...lead,turnstileToken:'t',website:'',recipient:'evil@example.test'}])assert.equal((await handler(request(body))).status,400);
 assert.equal((await handler(request(undefined,randomUUID(),{origin:'https://attacker.example'}))).status,403);
 assert.equal((await handler(request({...lead,requirements:'x'.repeat(20000),turnstileToken:'t',website:''}))).status,413);
 f.deps.verifyBot=async()=>false;assert.equal((await handler(request())).status,400);assert.equal(f.state.leads.length,0);
});
test('rate limit denies with Retry-After before bot/store work; store failure is redacted',async()=>{
 const f=fixture();let bot=0;f.deps.verifyBot=async()=>{bot++;return true};f.deps.store.consume=async()=>({allowed:false,retryAfter:77});
 const response=await createPublicLeadHandler(f.deps)(request());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'77');assert.equal(bot,0);
 f.deps.store.consume=async()=>{throw Error('synthetic secret password')};const failed=await createPublicLeadHandler(f.deps)(request());assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('synthetic secret'));assert.equal(f.state.leads.length,0);
});
test('failed challenges cannot exhaust email quota; each challenge gets a fresh verification nonce',async()=>{
 const f=fixture(),buckets=[],nonces=[],key=randomUUID();f.deps.store.consume=async input=>{buckets.push(...input);return {allowed:true,retryAfter:0}};f.deps.verifyBot=async(_,nonce)=>{nonces.push(nonce);return false};
 const handler=createPublicLeadHandler(f.deps);await handler(request(undefined,key));await handler(request(undefined,key));assert.ok(!buckets.some(bucket=>bucket.key.startsWith('email:')));assert.notEqual(nonces[0],key);assert.notEqual(nonces[0],nonces[1]);
});
test('confirmation cannot be forged, opened without receipt or used after expiry',()=>{
 const id=randomUUID(),now=Date.now(),value=receipt(id,receiptSecret,now);assert.equal(verifyReceipt(value,receiptSecret,now),id);assert.equal(verifyReceipt(value,receiptSecret,now+601000),null);assert.equal(verifyReceipt(value,secret,now),null);assert.equal(verifyReceipt('',receiptSecret),null);assert.equal(verifyReceipt(value,undefined),null);
});
test('Turnstile adapter checks hostname/action/age and rejects provider failures',async()=>{
 const valid={success:true,hostname:'leads.example.test',action:'lead-enquiry',challenge_ts:new Date().toISOString()};let requestBody;
 const verifier=turnstileVerifier('synthetic-secret','leads.example.test',async(_,options)=>{requestBody=JSON.parse(options.body);return Response.json(valid)});
 const id=randomUUID();assert.equal(await verifier('synthetic-token',id),true);assert.equal(requestBody.idempotency_key,id);
 for(const extra of [{hostname:'attacker.example'},{action:'other'},{success:false},{challenge_ts:'2000-01-01'}])assert.equal(await turnstileVerifier('s','leads.example.test',async()=>Response.json({...valid,...extra}))('t',id),false);
 await assert.rejects(turnstileVerifier('s','h',async()=>{throw Error('synthetic private error')})('t',id),e=>e.status===503&&!e.message.includes('private'));
});
function claim(){return {id:randomUUID(),leadId:randomUUID(),lead:{...lead,fullName:'<img src=x onerror=alert(1)>',requirements:'& <script>alert(1)</script>'},createdAt:new Date().toISOString(),lease:randomUUID(),attempt:1,firstAttemptAt:new Date().toISOString()};}
test('SMTP email is escaped, includes required fields and fixed recipient; acceptance is distinct from delivery',async()=>{
 const job=claim(),email=notificationEmail(job);assert.equal(email.to,'admin@vetthevat.com');assert.ok(!email.html.includes('<img'));assert.ok(email.html.includes('&lt;script&gt;'));for(const text of [job.lead.email,job.lead.businessName,job.lead.phone,job.lead.service,job.leadId,job.createdAt])assert.ok(email.text.includes(text));
 let capture;const config={host:'smtp.example.test',port:587,secure:false,user:'smtp-user',password:'synthetic-password',fromName:'VET THE VAT',fromEmail:'verified@example.test'},mailer=smtpLeadMailer(config,{sendMail:async message=>{capture=message;return {accepted:[{address:'admin@vetthevat.com'}],messageId:message.messageId};}});assert.deepEqual(await mailer.send(job),{accepted:true,providerId:`<lead-notification_${job.id}@example.test>`});assert.equal(capture.headers['X-VTV-Delivery-Reference'],'lead-notification/'+job.id);assert.equal(capture.to,'admin@vetthevat.com');
 await assert.rejects(smtpLeadMailer(config,{sendMail:async()=>{throw Error('SMTP failure');}}).send(job));
});
test('email failure never removes the saved lead; retry uses durable outbox and accepted is distinct from delivered',async()=>{
 const f=fixture();await createPublicLeadHandler(f.deps)(request());let failure=0,ack=0;const job=claim();
 const outbox={claim:async()=>job,accepted:async()=>{ack++},failed:async()=>{failure++}};
 const failed=await processOneLeadNotification(outbox,{send:async()=>{throw Error('provider down')}});assert.equal(failed.state,'retry_or_review');assert.equal(failure,1);assert.equal(ack,0);assert.equal(f.state.leads.length,1);
 const accepted=await processOneLeadNotification(outbox,{send:async()=>({accepted:true,providerId:'accepted-id'})});assert.equal(accepted.state,'accepted');assert.equal(ack,1);
 let claims=0;await assert.rejects(processOneLeadNotification({...outbox,claim:async()=>{claims++;return job}},undefined));assert.equal(claims,0);
 await assert.rejects(processOneLeadNotification({...outbox,accepted:async()=>{throw Error('unknown commit outcome')}},{send:async()=>({accepted:true,providerId:'accepted-id'})}));assert.equal(failure,1);
});
test('outbox claim SQL fences leases, caps attempts and requires manual review before provider idempotency expires',async()=>{
 const queries=[];const store=postgresLeadStore({transaction:work=>work({query:async(sql,values)=>{queries.push({sql,values});return {rows:[]}}})});assert.equal(await store.claim(),null);assert.match(queries[0].sql,/22 hours/);assert.match(queries[0].sql,/attempts>=8/);assert.match(queries[1].sql,/FOR UPDATE SKIP LOCKED/);
 await assert.rejects(store.accepted(claim(),'provider-id'),e=>e.status===409);
});
test('outbox worker rejects unapproved or unauthenticated triggers before accessing storage',async()=>{
 let calls=0;const operation=async()=>{calls++;return {state:'accepted'}};const req=token=>new Request(origin+'/api/internal/lead-notifications',{method:'POST',headers:token?{authorization:'Bearer '+token}:{}});
 assert.equal((await leadWorkerHandler(undefined,operation)(req(secret))).status,503);
 assert.equal((await leadWorkerHandler(secret,operation)(req('forged'))).status,401);assert.equal(calls,0);
 assert.equal((await leadWorkerHandler(secret,operation)(req(secret))).status,200);assert.equal(calls,1);
});
test('notifications older than the retry safety window are never sent again automatically',async()=>{
 let sent=0,failed=0;const job={...claim(),firstAttemptAt:new Date(Date.now()-23*3600000).toISOString()};
 const result=await processOneLeadNotification({claim:async()=>job,failed:async()=>{failed++},accepted:async()=>{}},{send:async()=>{sent++;return {accepted:true,providerId:'id'}}});assert.equal(result.state,'retry_or_review');assert.equal(sent,0);assert.equal(failed,1);
});
test('marketing public lead module dependency graph excludes VAT backend and permits only shared SMTP provider outside leads',()=>{
 const path=require('node:path'),visited=new Set();
 function walk(file){if(visited.has(file))return;visited.add(file);const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/from\s+["']@\/([^"']+)["']/g)){const base=match[1];if(base.startsWith('lib/server/'))assert.ok(base.startsWith('lib/server/leads/')||['lib/server/providers/smtp','lib/server/api-v1','lib/server/database-core','lib/server/config-validation'].includes(base),`${file} imports excluded ${base}`);assert.ok(!base.startsWith('tests/'));const dependency=['.ts','.tsx'].map(ext=>base+ext).find(candidate=>fs.existsSync(candidate));if(dependency)walk(dependency);}}
 for(const file of ['app/layout.tsx','app/get-started/thank-you/page.tsx','app/api/public/leads/route.ts','app/api/internal/lead-notifications/route.ts'])walk(file);
 assert.ok(visited.size>10);
});
test('integrated Get Started uses the persisted contact enquiry workflow without importing invoice or ORS services',()=>{
 const page=fs.readFileSync('app/get-started/page.tsx','utf8');assert.match(page,/ContactForm/);assert.match(page,/contactFormConfiguration/);assert.doesNotMatch(page,/lib\/server\/(?:saas|ors)\//);const form=fs.readFileSync('components/contact-form.tsx','utf8');assert.match(form,/\/api\/public\/contact/);assert.doesNotMatch(form,/lib\/server\//);
});
test('admin data is authorized before store access; status notes and service filters are validated',async()=>{
 let reads=0;const unavailable=adminLeadHandler(async()=>{throw new LeadError(401,'UNAUTHENTICATED','Sign in required.')},()=>{reads++;return undefined});assert.equal((await unavailable(new Request(origin+'/api/admin/leads'))).status,401);assert.equal(reads,0);
 let filters;const store={list:async input=>{filters=input;return {items:[],nextCursor:null}},update:async input=>input};
 const authorized=adminLeadHandler(async()=>({actor:'verified-server-admin'}),()=>({store,notify:async()=>({state:'idle'})}));
 assert.equal((await authorized(new Request(origin+'/api/admin/leads?service=ORS&status=qualified'))).status,200);assert.equal(filters.service,'ORS');assert.equal(filters.status,'qualified');
 const patch=new Request(origin+'/api/admin/leads',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:randomUUID(),status:'contacted',notes:'Follow up',version:1})});assert.equal((await authorized(patch)).status,200);
 assert.equal((await authorized(new Request(origin+'/api/admin/leads?status=paid'))).status,400);
});
test('lead configuration defaults disabled, requires reviewed storage and real bot keys; mail has independent approval switch',()=>{
 assert.equal(readLeadConfiguration({}),undefined);
 const config={LEADS_ENABLED:'1',LEADS_ORIGIN:origin,LEADS_DATABASE_URL:'postgresql://vetthevat_leads_runtime:synthetic@managed.example.test/leads_test',LEADS_DATABASE_NAME:'leads_test',LEADS_HASH_SECRET:secret,LEADS_RECEIPT_SECRET:receiptSecret,LEADS_TURNSTILE_SITE_KEY:'real-looking-synthetic-key',LEADS_TURNSTILE_SECRET_KEY:'synthetic-secret'};
 assert.equal(readLeadConfiguration(config).email,null);
 for(const patch of [{LEADS_DATABASE_URL:'postgresql://postgres:synthetic@host/leads_test'},{LEADS_RECEIPT_SECRET:secret},{LEADS_TURNSTILE_SITE_KEY:'1x00000000000000000000AA'},{LEADS_ORIGIN:'https://attacker.example/path'},{LEADS_DATABASE_URL:config.LEADS_DATABASE_URL+'?sslmode=disable'}])assert.equal(readLeadConfiguration({...config,...patch}),undefined);
});
test('proxy retains exact public POST exceptions and delegates private authorization',()=>{
 const source=fs.readFileSync('proxy.ts','utf8');
 assert.match(source,/pathname === "\/api\/public\/leads"/);assert.match(source,/request.method === "POST"/);assert.match(source,/status: 405/);assert.match(source,/privateRouteDecision/);assert.match(source,/authorizeCookie/);
});

test('all Get Started link sources use dedicated page and client code contains no persistence or recipient',()=>{
 for(const file of ['components/public-shell.tsx','app/page.tsx','app/features/page.tsx'])assert.match(fs.readFileSync(file,'utf8'),/href="\/get-started"[^>]*>Get Started/);
 const client=fs.readFileSync('components/lead-form.tsx','utf8');assert.doesNotMatch(client,/localStorage|sessionStorage|admin@vetthevat|SMTP_PASSWORD|DATABASE_URL/);assert.match(client,/idempotency-key/);assert.match(client,/consent/);
});

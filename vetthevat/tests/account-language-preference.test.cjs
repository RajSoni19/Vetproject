const test=require('node:test'),assert=require('node:assert/strict'),{loadSource}=require('./load-source.cjs');
const preference=loadSource('lib/server/web-auth/language-preference');
test('account locale persistence stays disabled until the exact reviewed schema is explicitly activated',()=>{
 const hash=preference.accountLanguagePreferenceSchemaSha256;
 assert.equal(hash,'376d4ca0e29ee1e461eec58480cf4d66fa453066a31c988553d5e482c4f62224');
 assert.equal(preference.accountLanguagePreferenceEnabled({WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED:'1',WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256:hash}),true);
 for(const env of [{WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256:hash},{WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED:'1',WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256:'0'.repeat(64)},{WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED:'true',WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256:hash}])assert.equal(preference.accountLanguagePreferenceEnabled(env),false);
});
test('language preference accepts only supported application locale identifiers',()=>{
 assert.equal(preference.localeInput('hi-IN'),'hi-IN');
 for(const value of ['en','en-US','xx-XX','',null,12])assert.throws(()=>preference.localeInput(value),{status:400});
});
test('account language update is session-bound and audited without exposing session hashes',async()=>{
 const {WebAuthStore}=loadSource('lib/server/web-auth/store'),queries=[],sessionHash='a'.repeat(64),user='123e4567-e89b-42d3-a456-426614174000';
 const store=new WebAuthStore(async operation=>operation({query:async(sql,values=[])=>{queries.push({sql,values});if(sql.startsWith('UPDATE web_auth.users'))return {rows:[{id:user,preferred_locale:'ar'}]};return {rows:[]};}}));
 assert.equal(await store.updatePreferredLocale(sessionHash,'ar'),'ar');
 const update=queries.find(q=>q.sql.startsWith('UPDATE web_auth.users'));
 assert.deepEqual(update.values,[sessionHash,'ar']);assert.match(update.sql,/s\.token_hash=\$1/);assert.match(update.sql,/s\.revoked_at IS NULL/);assert.match(update.sql,/s\.expires_at>now\(\)/);assert.ok(queries.some(q=>q.sql.includes('INSERT INTO web_auth.audit_logs')&&q.values.includes('auth.locale.updated')));assert.ok(!JSON.stringify(queries.find(q=>q.sql.includes('INSERT INTO web_auth.audit_logs')).values).includes(sessionHash));
 await assert.rejects(store.updatePreferredLocale(sessionHash,'not-a-locale'),{status:400});
});
test('profile API keeps the preference disabled until activation and enforces the authenticated CSRF flow',async()=>{
 const {webAuthHandler}=loadSource('lib/server/web-auth/http'),core=loadSource('lib/server/web-auth/core'),security=loadSource('lib/server/web-auth/crypto');
 const savedEnabled=process.env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED,savedHash=process.env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256,token=security.opaqueToken(),principal={userId:'123e4567-e89b-42d3-a456-426614174000',sessionId:'223e4567-e89b-42d3-a456-426614174000',tokenHash:security.tokenHash(token),roles:[]};let readLocale=false,updated=[];
 const services={config:{origin:'https://localhost:3444',csrfSecret:'b'.repeat(64)},store:{principal:async()=>principal,profile:async(_id,include)=>{readLocale=include;return {fullName:'Test User',email:'test@example.test',emailVerified:true,...(include?{preferredLocale:'es-ES'}:{})};},updatePreferredLocale:async(hash,locale)=>{updated.push({hash,locale});return locale;},consume:async()=>({allowed:true,retryAfterSeconds:0})}};
 const cookie=`__Host-vetthevat-session=${token}`,headersFor=method=>{const headers=new Headers({cookie,'origin':'https://localhost:3444','sec-fetch-site':'same-origin','content-type':'application/json'});if(method==='PUT')headers.set('x-csrf-token',security.csrfToken(services.config.csrfSecret,core.binding(services,principal)));return headers;};
 try{
  delete process.env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED;delete process.env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256;
  let response=await webAuthHandler(new Request('https://localhost:3444/api/account/profile',{headers:headersFor('GET')}),services);assert.equal(response.status,200);let body=await response.json();assert.equal(body.languagePreferenceEnabled,false);assert.equal(readLocale,false);assert.equal(body.profile.preferredLocale,undefined);
  response=await webAuthHandler(new Request('https://localhost:3444/api/account/profile',{method:'PUT',headers:headersFor('PUT'),body:JSON.stringify({preferredLocale:'ar'})}),services);assert.equal(response.status,503);assert.equal(updated.length,0);
  process.env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED='1';process.env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256=preference.accountLanguagePreferenceSchemaSha256;
  response=await webAuthHandler(new Request('https://localhost:3444/api/account/profile',{headers:headersFor('GET')}),services);assert.equal(response.status,200);body=await response.json();assert.equal(body.languagePreferenceEnabled,true);assert.equal(body.profile.preferredLocale,'es-ES');assert.equal(readLocale,true);
  response=await webAuthHandler(new Request('https://localhost:3444/api/account/profile',{method:'PUT',headers:headersFor('PUT'),body:JSON.stringify({preferredLocale:'ar'})}),services);assert.equal(response.status,200);assert.deepEqual(await response.json(),{preferredLocale:'ar'});assert.deepEqual(updated,[{hash:principal.tokenHash,locale:'ar'}]);
  response=await webAuthHandler(new Request('https://localhost:3444/api/account/profile',{method:'PUT',headers:headersFor('PUT'),body:JSON.stringify({preferredLocale:'invalid'})}),services);assert.equal(response.status,400);assert.equal(updated.length,1);
 }finally{if(savedEnabled===undefined)delete process.env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED;else process.env.WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED=savedEnabled;if(savedHash===undefined)delete process.env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256;else process.env.WEB_AUTH_LANGUAGE_PREFERENCE_SCHEMA_SHA256=savedHash;}
});
test('local workspace launcher activates account locale only when the approved column and migration digest are present',()=>{
 const fs=require('node:fs'),launcher=fs.readFileSync('scripts/local-workspace.cjs','utf8');
 assert.match(launcher,/users_preferred_locale_check/);assert.match(launcher,/accountLanguagePreferenceSchemaPresent:accountLanguagePreference/);assert.match(launcher,/WEB_AUTH_LANGUAGE_PREFERENCE_ENABLED:status\.accountLanguagePreference\?'1':'0'/);assert.match(launcher,new RegExp(preference.accountLanguagePreferenceSchemaSha256));
});

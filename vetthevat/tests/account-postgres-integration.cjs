// Real isolated PostgreSQL/HTTPS password-change acceptance. No migrations.
const s=require('./saas-services.cjs'),{assert,application,provision,verify,login,operator}=s;
const results=[];const check=async(name,fn)=>{await fn();results.push({name,result:'passed'});console.log('REAL PASS '+name);};
async function run(){let a,first,second;
 try{
 await check('new disposable identity verifies and opens two real sessions',async()=>{a=await provision('password-change');await verify(a);first=await login(a);second=await login(a);});
 const change=(body,csrf=first.csrf)=>application('/api/auth/change-password',{method:'POST',cookie:first.cookie,csrf,body});
 await check('missing CSRF and incorrect current password reject without revoking sessions',async()=>{assert.equal((await change({currentPassword:a.password,newPassword:'a-new-isolated-password-123'},'')).status,403);assert.equal((await change({currentPassword:'incorrect-current-password',newPassword:'a-new-isolated-password-123'})).status,403);assert.equal((await application('/api/auth/session',{cookie:first.cookie})).status,200);});
 const next=s.crypto.randomBytes(24).toString('base64url');
 await check('confirmed password change revokes every session and clears secure cookie',async()=>{const result=await change({currentPassword:a.password,newPassword:next});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.changed,true);assert.ok(result.headers['set-cookie'][0].includes('Max-Age=0'));assert.equal((await application('/api/auth/session',{cookie:first.cookie})).status,401);assert.equal((await application('/api/auth/session',{cookie:second.cookie})).status,401);});
 await check('old password fails; new password authenticates; audit and Argon2id persist',async()=>{assert.equal((await application('/api/auth/session',{method:'POST',body:{email:a.email,password:a.password}})).status,401);a.password=next;const active=await login(a);assert.equal((await application('/app/settings',{cookie:active.cookie})).status,200);await operator(async db=>{const u=(await db.query('SELECT password_hash FROM web_auth.users WHERE id=$1',[a.userId])).rows[0];assert.ok(u.password_hash.startsWith('$argon2id$'));assert.equal((await db.query("SELECT 1 FROM web_auth.audit_logs WHERE actor_user_id=$1 AND action='auth.password.changed'",[a.userId])).rowCount,1);});});
 }finally{s.fs.mkdirSync(s.path.join(s.root,'.go-live'),{recursive:true});s.fs.writeFileSync(s.path.join(s.root,'.go-live/account-integration.json'),JSON.stringify({at:new Date().toISOString(),passed:results.length,results,complete:results.length===4},null,2));}
}
run().catch(e=>{console.error('Real account integration failed: '+e.message);process.exitCode=1;});

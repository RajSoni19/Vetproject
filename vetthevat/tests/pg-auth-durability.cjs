// Restart only the approved cluster. No migration, account grant or email.
const {assert,fs,path,directory,operator,provision,verify,login,application}=require('./pg-auth-services.cjs');
const {execFileSync}=require('node:child_process');
async function run(){
 await operator(db=>db.query('DELETE FROM web_auth.rate_limits'));
 const account=await provision('durability');await verify(account);const session=await login(account);
 assert.ok(fs.existsSync(path.join(directory,'runtime.json')));
 const ctl='C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe',cluster=path.join(directory,'cluster');
 execFileSync(ctl,['-D',cluster,'-m','fast','-w','stop'],{stdio:'ignore',windowsHide:true});
 execFileSync(ctl,['-D',cluster,'-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55439 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse','-w','start'],{stdio:'ignore',windowsHide:true});
 assert.equal((await application('/api/auth/session',{cookie:session.cookie})).status,200,'Session survives real PostgreSQL process restart');
 assert.equal((await application('/api/auth/logout',{method:'POST',cookie:session.cookie,csrf:session.csrf})).status,200);
 assert.equal((await application('/api/auth/session',{cookie:session.cookie})).status,401,'Revocation durable');
 console.log('PASS durable account/session across real isolated PostgreSQL restart, followed by logout revocation.');
}
run().catch(e=>{console.error('Durability test failed: '+e.message);process.exitCode=1;});

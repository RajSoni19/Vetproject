// Only the explicitly approved NEW isolated cluster. No generic migration runner.
const {fs,path,crypto,root,directory}=require('./pg-auth-common.cjs');
const {execFileSync}=require('node:child_process'),{Client}=require('pg'),net=require('node:net');
const bin='C:/Program Files/PostgreSQL/17/bin';
async function run(){
 if(!process.argv.includes('--apply-approved-test-migration')||process.env.VERCEL!==undefined)throw Error('Explicit isolated migration approval flag required.');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});if(fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase())throw Error('Redirected test directory refused.');
 for(const name of ['cluster','runtime.json'])if(fs.existsSync(path.join(directory,name)))throw Error('Refusing an existing cluster or configuration.');
 await new Promise((resolve,reject)=>{const socket=net.connect({host:'127.0.0.1',port:55439});socket.once('connect',()=>{socket.destroy();reject(Error('Test port is occupied; nothing was changed.'));});socket.once('error',()=>resolve());});
 execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/pg-auth-permissions.ps1')],{stdio:'ignore',windowsHide:true});
 const operatorPassword=crypto.randomBytes(32).toString('hex'),runtimePassword=crypto.randomBytes(32).toString('hex'),businessPassword=crypto.randomBytes(32).toString('hex'),passwordFile=path.join(directory,'init-password');
 fs.writeFileSync(passwordFile,operatorPassword,{flag:'wx',mode:0o600});
 try{execFileSync(path.join(bin,'initdb.exe'),['-D',path.join(directory,'cluster'),'-U','vtv_test_operator','--pwfile='+passwordFile,'--auth-host=scram-sha-256','--auth-local=scram-sha-256','--locale=C','--encoding=UTF8'],{stdio:'pipe',windowsHide:true});}finally{fs.unlinkSync(passwordFile);}
 execFileSync(path.join(bin,'pg_ctl.exe'),['-D',path.join(directory,'cluster'),'-l',path.join(directory,'postgres.log'),'-o',"-h 127.0.0.1 -p 55439 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse",'-w','start'],{stdio:'ignore',windowsHide:true});
 const base={host:'127.0.0.1',port:55439,user:'vtv_test_operator',password:operatorPassword,connectionTimeoutMillis:5000},system=new Client({...base,database:'postgres'});await system.connect();try{await system.query('CREATE DATABASE vtv_web_auth_test');}finally{await system.end();}
 const client=new Client({...base,database:'vtv_web_auth_test'});await client.connect();try{
  const migration=fs.readFileSync(path.join(root,'database/migrations/web-auth/001_web_auth.review.sql'),'utf8').replace(/^\uFEFF/,'');await client.query(migration);
  // These strings are generated hex, not caller input. Never log SQL/passwords.
  await client.query(`ALTER ROLE vtv_web_runtime PASSWORD '${runtimePassword}'`);await client.query(`ALTER ROLE vtv_web_business PASSWORD '${businessPassword}'`);
  const installationId=(await client.query('SELECT id FROM web_auth.installation')).rows[0].id;
  fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify({version:1,host:'127.0.0.1',port:55439,database:'vtv_web_auth_test',operatorPassword,runtimePassword,businessPassword,installationId,csrfSecret:crypto.randomBytes(32).toString('hex'),outboxKey:crypto.randomBytes(32).toString('hex')},null,2),{flag:'wx',mode:0o600});
 }finally{await client.end();}
 const openssl='C:/Program Files/Git/mingw64/bin/openssl.exe';execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','30','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',path.join(directory,'localhost.key'),'-out',path.join(directory,'localhost.crt')],{stdio:'ignore',windowsHide:true});
 console.log('Approved migration applied ONLY to NEW 127.0.0.1:55439/vtv_web_auth_test. No users or administrator were created.');
}
run().catch(error=>{console.error('Isolated initialization failed: '+(error.code??error.message));process.exitCode=1;});

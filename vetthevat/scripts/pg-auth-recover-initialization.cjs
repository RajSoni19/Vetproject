// Recovery only for the freshly approved, stopped cluster whose startup pipe
// prevented its initializer from completing. Never accepts another target.
const {fs,path,crypto,root,directory}=require('./pg-auth-common.cjs');
const {execFileSync}=require('node:child_process'),{Client}=require('pg');
async function run(){
 if(!process.argv.includes('--approved-initialization-recovery')||process.env.VERCEL!==undefined)throw Error('Explicit isolated recovery flag required');
 if(fs.realpathSync(directory).toLowerCase()!==directory.toLowerCase()||fs.existsSync(path.join(directory,'runtime.json'))||fs.existsSync(path.join(directory,'cluster/postmaster.pid')))throw Error('Recovery requires the new, stopped, unconfigured cluster');
 if(fs.readFileSync(path.join(directory,'cluster/PG_VERSION'),'utf8').trim()!=='17')throw Error('Unexpected cluster');
 const bin='C:/Program Files/PostgreSQL/17/bin',operatorPassword=crypto.randomBytes(32).toString('hex'),runtimePassword=crypto.randomBytes(32).toString('hex'),businessPassword=crypto.randomBytes(32).toString('hex');
 // Offline operator recovery preserves SCRAM authentication throughout.
 execFileSync(path.join(bin,'postgres.exe'),['--single','-D',path.join(directory,'cluster'),'postgres'],{input:`ALTER ROLE vtv_test_operator PASSWORD '${operatorPassword}';\n`,stdio:['pipe','ignore','ignore'],windowsHide:true});
 execFileSync(path.join(bin,'pg_ctl.exe'),['-D',path.join(directory,'cluster'),'-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55439 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse','-w','start'],{stdio:'ignore',windowsHide:true});
 const base={host:'127.0.0.1',port:55439,user:'vtv_test_operator',password:operatorPassword,connectionTimeoutMillis:5000};
 const system=new Client({...base,database:'postgres'});await system.connect();try{await system.query('CREATE DATABASE vtv_web_auth_test');}finally{await system.end();}
 const db=new Client({...base,database:'vtv_web_auth_test'});await db.connect();try{
  await db.query(fs.readFileSync(path.join(root,'database/migrations/web-auth/001_web_auth.review.sql'),'utf8').replace(/^\uFEFF/,''));
  await db.query(`ALTER ROLE vtv_web_runtime PASSWORD '${runtimePassword}'`);await db.query(`ALTER ROLE vtv_web_business PASSWORD '${businessPassword}'`);
  const installationId=(await db.query('SELECT id FROM web_auth.installation')).rows[0].id;
  fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify({version:1,host:'127.0.0.1',port:55439,database:'vtv_web_auth_test',operatorPassword,runtimePassword,businessPassword,installationId,csrfSecret:crypto.randomBytes(32).toString('hex'),outboxKey:crypto.randomBytes(32).toString('hex')},null,2),{flag:'wx',mode:0o600});
 }finally{await db.end();}
 execFileSync('C:/Program Files/Git/mingw64/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-days','30','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-keyout',path.join(directory,'localhost.key'),'-out',path.join(directory,'localhost.crt')],{stdio:'ignore',windowsHide:true});
 console.log('Approved migration applied to isolated test database only; no accounts created.');
}
run().catch(e=>{console.error('Initialization recovery failed: '+(e.code??e.message));process.exitCode=1;});

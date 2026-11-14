// Resume ONLY the approved new cluster after its backup environment failure.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{Client}=require('pg');
const root=path.resolve(__dirname,'..'),directory='D:/vetthevat.saas-dev',hash='d70e4e20c828e2e91349f8a6fce450c330716b16493c9868e023cf25c911d366';
async function run(){
 if(process.env.SAAS_MIGRATION_APPROVAL!==hash||process.env.VERCEL!==undefined||fs.existsSync(path.join(directory,'runtime.json'))||fs.realpathSync(directory).toLowerCase()!==path.resolve(directory).toLowerCase())throw Error('Resume refused');
 const sql=fs.readFileSync(path.join(root,'database/migrations/saas/001_saas_foundation.review.sql'),'utf8');if(crypto.createHash('sha256').update(sql).digest('hex')!==hash)throw Error('SQL mismatch');
 const c=JSON.parse(fs.readFileSync(path.join(directory,'bootstrap.json'),'utf8'));if(c.host!=='127.0.0.1'||c.port!==55440||c.database!=='vtv_saas_dev'||c.operator!=='vtv_saas_operator'||c.approvedSqlHash!==hash)throw Error('Target mismatch');
 const db=new Client({host:c.host,port:c.port,database:c.database,user:c.operator,password:c.operatorPassword,ssl:false,connectionTimeoutMillis:5000});await db.connect();try{
  const r=(await db.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,pg_get_userbyid(datdba) AS owner,current_setting('data_directory') AS directory FROM pg_database WHERE datname=current_database()" )).rows[0];
  if(r.database!==c.database||r.host!==c.host||r.port!==c.port||r.owner!=='vtv_saas_database_owner'||path.resolve(r.directory).toLowerCase()!==path.resolve(directory,'cluster').toLowerCase())throw Error('Server identity mismatch');
  if((await db.query("SELECT 1 FROM pg_namespace WHERE nspname NOT IN('public','information_schema') AND nspname !~ '^pg_'")).rowCount)throw Error('Refusing existing application schema');
  const env={...process.env,PGPASSWORD:c.operatorPassword,PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable'};delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.PGOPTIONS;
  const bin='C:/Program Files/PostgreSQL/17/bin',backup=path.join(directory,'backups');
  execFileSync(path.join(bin,'pg_dump.exe'),['-h',c.host,'-p','55440','-U',c.operator,'--no-password','-Fc','-f',path.join(backup,'stage-a-before.dump'),c.database],{env,stdio:'pipe',windowsHide:true});
  execFileSync(path.join(bin,'pg_dumpall.exe'),['-h',c.host,'-p','55440','-U',c.operator,'--no-password','--globals-only','-f',path.join(backup,'stage-a-before-roles.sql')],{env,stdio:'pipe',windowsHide:true});
  execFileSync(path.join(bin,'pg_restore.exe'),['--list',path.join(backup,'stage-a-before.dump')],{stdio:'ignore',windowsHide:true});
  const sums=Object.fromEntries(['stage-a-before.dump','stage-a-before-roles.sql'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(backup,n))).digest('hex')]));fs.writeFileSync(path.join(backup,'checksums.json'),JSON.stringify(sums,null,2),{mode:0o600});
  const result=await db.query(sql);if(result.at(-1).command!=='COMMIT')throw Error('No commit acknowledgement');
  await db.query(`ALTER ROLE vtv_web_runtime PASSWORD '${c.authPassword}'`);await db.query(`ALTER ROLE vtv_saas_runtime PASSWORD '${c.businessPassword}'`);
  const authInstallationId=(await db.query('SELECT id::text FROM web_auth.installation')).rows[0].id,installationId=(await db.query('SELECT installation_id::text FROM saas.schema_version')).rows[0].installation_id;
  fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify({version:1,host:c.host,port:c.port,database:c.database,operatorPassword:c.operatorPassword,authPassword:c.authPassword,businessPassword:c.businessPassword,authInstallationId,installationId,csrfSecret:crypto.randomBytes(32).toString('hex'),outboxKey:crypto.randomBytes(32).toString('hex'),approvedSqlHash:hash}),{flag:'wx',mode:0o600});
  console.log('Approved Stage A SQL COMMIT confirmed; target/path/owner and pre-migration backups verified. No account created.');
 }finally{await db.end();}
}
run().catch(e=>{console.error('Approved resume failed: '+(e.code??e.message));process.exitCode=1;});

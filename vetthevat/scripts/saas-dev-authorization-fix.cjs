const {fs,path,crypto,root,directory,configuration,connection}=require('./saas-dev-common.cjs'),{Client}=require('pg'),{execFileSync}=require('node:child_process');
const expected='082079c74f4788fa5724a30f86a443c46ed0179c8c0329c756a9323a690d80fd';
async function run(){
 if(process.env.SAAS_CORRECTIVE_APPROVAL!==expected||process.env.VERCEL!==undefined)throw Error('Exact corrective approval required');
 const sql=fs.readFileSync(path.join(root,'database/migrations/saas/002_stage_a_authorization_locks.review.sql'),'utf8');if(crypto.createHash('sha256').update(sql).digest('hex')!==expected)throw Error('Corrective SQL mismatch');
 const c=configuration(),db=new Client(connection('vtv_saas_operator'));await db.connect();try{
  const r=(await db.query("SELECT current_database() AS database,inet_server_port() AS port,host(inet_server_addr()) AS host,current_setting('data_directory') AS directory,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation")).rows[0];
  if(r.database!==c.database||r.port!==c.port||r.host!==c.host||r.installation!==c.installationId||path.resolve(r.directory).toLowerCase()!==path.join(directory,'cluster').toLowerCase())throw Error('Corrective target mismatch');
  const base=path.join(directory,'backups','authorization-fix-before');if(fs.existsSync(base+'.dump'))throw Error('Corrective backup exists; inspect state');
  const env={...process.env,PGPASSWORD:c.operatorPassword,PGHOSTADDR:c.host,PGSSLMODE:'disable'};delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.PGOPTIONS;
  execFileSync('C:/Program Files/PostgreSQL/17/bin/pg_dump.exe',['-h',c.host,'-p','55440','-U','vtv_saas_operator','--no-password','-Fc','-f',base+'.dump',c.database],{env,stdio:'ignore',windowsHide:true});
  execFileSync('C:/Program Files/PostgreSQL/17/bin/pg_restore.exe',['--list',base+'.dump'],{stdio:'ignore',windowsHide:true});
  fs.writeFileSync(base+'.sha256',crypto.createHash('sha256').update(fs.readFileSync(base+'.dump')).digest('hex'),{flag:'wx',mode:0o600});
  const result=await db.query(sql);if(result.at(-1).command!=='COMMIT')throw Error('Correction not committed');
  fs.writeFileSync(path.join(directory,'authorization-fix-applied.json'),JSON.stringify({sha256:expected,committed:true,target:'127.0.0.1:55440/vtv_saas_dev',at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  console.log('Approved corrective Stage A migration COMMIT confirmed; FORCE RLS and runtime grants unchanged.');
 }finally{await db.end();}
}
run().catch(e=>{console.error('Correction refused/failed: '+(e.code??e.message));process.exitCode=1;});

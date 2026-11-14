// Read-only, isolated pre-approval backup preparation. Does not execute SQL.
const s=require('./saas-dev-common.cjs'),{Client}=require('pg'),{execFileSync}=require('node:child_process');
async function main(){
 const config=s.configuration(),db=new Client({...s.connection('vtv_saas_operator'),statement_timeout:30000});await db.connect();
 let backup;
 try{
  const target=(await db.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_user role,session_user session_role,current_setting('data_directory') data_directory,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) installation,to_regprocedure('saas.provision_company(text,text,text,uuid,character,character)') IS NOT NULL onboarding,to_regprocedure('saas.team_identity(text)') IS NOT NULL team,to_regclass('saas.stripe_accounts') IS NOT NULL billing,to_regclass('saas.trial_history') IS NOT NULL trial_schema")).rows[0];
  if(target.db!=='vtv_saas_dev'||target.host!=='127.0.0.1'||target.port!==55440||target.role!=='vtv_saas_operator'||target.session_role!==target.role||target.installation!==config.installationId||s.path.resolve(target.data_directory).toLowerCase()!==s.path.resolve(s.directory,'cluster').toLowerCase()||!target.onboarding||!target.team||!target.billing||target.trial_schema)throw Error('Isolated backup target/precondition mismatch; refuse a pre-migration backup of a changed schema');
  const root=s.path.join(s.directory,'backups');if(s.fs.realpathSync(root).toLowerCase()!==root.toLowerCase())throw Error('Redirected backup directory refused');
  backup=s.path.join(root,`preapproval-automatic-trial-${new Date().toISOString().replace(/[^0-9]/g,'')}-${s.crypto.randomUUID()}`);s.fs.mkdirSync(backup,{mode:0o700});if(s.fs.realpathSync(backup).toLowerCase()!==backup.toLowerCase())throw Error('Redirected backup target refused');
  const env={...process.env,PGPASSWORD:config.operatorPassword,PGHOSTADDR:config.host,PGSSLMODE:'disable'};for(const key of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGDATABASE','PGUSER','PGHOST','PGPORT','PGPASSFILE'])delete env[key];
  const bin='C:/Program Files/PostgreSQL/17/bin/',common=['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password'];
  execFileSync(bin+'pg_dump.exe',[...common,'-Fc','-f',s.path.join(backup,'before.dump'),'vtv_saas_dev'],{env,stdio:'ignore',windowsHide:true});
  execFileSync(bin+'pg_dumpall.exe',[...common,'--database=vtv_saas_dev','--roles-only','-f',s.path.join(backup,'roles.sql')],{env,stdio:'ignore',windowsHide:true});
  const listing=execFileSync(bin+'pg_restore.exe',['--list',s.path.join(backup,'before.dump')],{stdio:['ignore','pipe','ignore'],windowsHide:true});if(!listing.length)throw Error('Backup archive listing is empty');
  s.fs.writeFileSync(s.path.join(backup,'archive-list.txt'),listing,{flag:'wx',mode:0o600});
  const names=['before.dump','roles.sql','archive-list.txt'],hashes=Object.fromEntries(names.map(name=>[name,s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(backup,name))).digest('hex')]));
  s.fs.writeFileSync(s.path.join(backup,'checksums.json'),JSON.stringify(hashes,null,2),{flag:'wx',mode:0o600});
  const verified=names.every(name=>s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(backup,name))).digest('hex')===hashes[name]);if(!verified)throw Error('Backup checksum verification failed');
  console.log(JSON.stringify({target:'127.0.0.1:55440/vtv_saas_dev',backup,archiveListed:true,hashesVerified:true,files:hashes,restoreDrill:false,migrationExecuted:false},null,2));
 }finally{await db.end();}
}
main().catch(error=>{console.error('Local pre-approval backup failed:',error.code||error.message);process.exitCode=1;});

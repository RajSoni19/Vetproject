// Produces a private pre-change backup and proves it restores into a disposable
// database in the same isolated local cluster. Never runs the shopping migration.
const s=require('./saas-dev-common.cjs'),{Client}=require('pg'),{execFileSync}=require('node:child_process');
const migrationId='031-shopping',expected='';
function command(bin,args,env){return execFileSync(bin,args,{env,stdio:'ignore',windowsHide:true});}
async function main(){
 const candidate=require('./saas-reviewed-migration.cjs').candidate(migrationId);if(expected&&candidate.hash!==expected)throw Error('Reviewed SQL checksum changed.');
 const config=s.configuration(),db=new Client({...s.connection('vtv_saas_operator'),statement_timeout:30000});await db.connect();let backup,drillName,drillCreated=false,drillDropped=false;
 try{
  const t=(await db.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,current_setting('data_directory') AS data_directory,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,(to_regclass('operations.shopping_catalogue') IS NOT NULL OR to_regclass('operations.shopping_requisitions') IS NOT NULL) AS shopping_present")).rows[0];
  if(t.db!=='vtv_saas_dev'||t.host!=='127.0.0.1'||t.port!==55440||t.role!=='vtv_saas_operator'||t.session_role!==t.role||t.installation!==config.installationId||s.path.resolve(t.data_directory).toLowerCase()!==s.path.resolve(s.directory,'cluster').toLowerCase()||t.shopping_present)throw Error('Approved target/pre-migration state mismatch.');
  const root=s.path.join(s.directory,'backups');if(s.fs.realpathSync(root).toLowerCase()!==root.toLowerCase())throw Error('Redirected backup directory refused.');
  backup=s.path.join(root,`ors-shopping-before-${new Date().toISOString().replace(/[^0-9]/g,'')}-${s.crypto.randomUUID()}`);s.fs.mkdirSync(backup,{mode:0o700});if(s.fs.realpathSync(backup).toLowerCase()!==backup.toLowerCase())throw Error('Redirected backup target refused.');
  const env={...process.env,PGPASSWORD:config.operatorPassword,PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable'};for(const key of ['PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGDATABASE','PGUSER','PGHOST','PGPORT','PGPASSFILE'])delete env[key];
  const bin='C:/Program Files/PostgreSQL/17/bin/',common=['-h','127.0.0.1','-p','55440','-U','vtv_saas_operator','--no-password'];
  command(bin+'pg_dump.exe',[...common,'-Fc','-f',s.path.join(backup,'before.dump'),'vtv_saas_dev'],env);
  command(bin+'pg_dumpall.exe',[...common,'--database=vtv_saas_dev','--roles-only','-f',s.path.join(backup,'roles.sql')],env);
  const listing=execFileSync(bin+'pg_restore.exe',['--list',s.path.join(backup,'before.dump')],{stdio:['ignore','pipe','ignore'],windowsHide:true});if(!listing.length)throw Error('Backup archive listing is empty.');s.fs.writeFileSync(s.path.join(backup,'archive-list.txt'),listing,{flag:'wx',mode:0o600});
  const names=['before.dump','roles.sql','archive-list.txt'],hashes=Object.fromEntries(names.map(n=>[n,s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(backup,n))).digest('hex')]));s.fs.writeFileSync(s.path.join(backup,'checksums.json'),JSON.stringify(hashes,null,2),{flag:'wx',mode:0o600});
  for(const n of names)if(s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(backup,n))).digest('hex')!==hashes[n])throw Error('Backup checksum verification failed.');
  drillName='vtv_restore_ors_'+s.crypto.randomBytes(5).toString('hex');
  command(bin+'createdb.exe',[...common,'--owner=vtv_saas_operator',drillName],env);drillCreated=true;
  command(bin+'pg_restore.exe',[...common,'--exit-on-error','--no-owner','--no-acl','--dbname='+drillName,s.path.join(backup,'before.dump')],env);
  // The verifier connection remains on the source database; use an explicit
  // connection to the disposable database for post-restore checks.
  const drill=new Client({...s.connection('vtv_saas_operator'),database:drillName,statement_timeout:30000});await drill.connect();let check;try{check=(await drill.query("SELECT current_database() AS db,(SELECT count(*) FROM saas.schema_version) AS schema_rows,to_regclass('operations.purchase_requests') IS NOT NULL AS ors,to_regclass('business.invoices') IS NOT NULL AS invoices")).rows[0];}finally{await drill.end();}
  if(check.db!==drillName||Number(check.schema_rows)<1||!check.ors||!check.invoices)throw Error('Disposable restore content verification failed.');
  await db.query('DROP DATABASE '+JSON.stringify(drillName));drillDropped=true;
  const record={createdAt:new Date().toISOString(),target:'127.0.0.1:55440/vtv_saas_dev',migration:candidate.file,migrationSha256:candidate.hash,backup,backupHashes:hashes,archiveListed:true,restoreDrill:{database:drillName,restoredAndVerified:true,dropped:true},migrationExecuted:false};s.fs.writeFileSync(s.path.join(backup,'preparation.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(record,null,2));
 }finally{
  if(drillCreated&&!drillDropped&&drillName){try{const name=drillName;if(!/^vtv_restore_ors_[a-f0-9]+$/.test(name))throw Error('Unexpected restore target name.');await db.query('DROP DATABASE '+JSON.stringify(name));drillDropped=true;}catch{}}
  await db.end();
 }
}
main().catch(e=>{console.error('ORS migration preparation failed:',e.code||e.message,'No migration was executed.');process.exitCode=1;});

// Offline review package only. Never connects, approves SQL, reads secrets or deploys.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {render}=require('./render.cjs'),{assess}=require('./serververse-capacity.cjs');
const root=path.resolve(__dirname,'../..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function prepare(output){
 const out=path.resolve(output),relative=path.relative(root,out);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(out))throw Error('New workspace review directory required');
 fs.mkdirSync(out,{recursive:true});
 const migrationRoot=path.join(root,'database/migrations/saas');
 const superseded=new Set(['003_stage_b_invoices.review.sql','006_operations_ors.review.sql','027_company_price_intelligence.review.sql']);
 const files=fs.readdirSync(migrationRoot).filter(name=>name.endsWith('.review.sql')&&!name.includes('.rollback.')&&!name.includes('.rehearsal.')&&!superseded.has(name)).sort();
 const migrations=files.map((file,index)=>{const sql=fs.readFileSync(path.join(migrationRoot,file),'utf8');return {order:index+1,source:'database/migrations/saas/'+file,sha256:hash(sql),approved:false,productionCompatible:false,needsTargetRebase:/vtv_saas_dev|55440|vtv_saas_operator|D:\/?/i.test(sql),hasWindowsDataDirectory:sql.includes('D:/vetthevat.saas-dev/cluster'),containsFixedInstallation:sql.includes('2e8c4c03-f697-465e-8beb-f3a371d3b355')};});
 const language='database/migrations/web-auth/030_user_language_preference.review.sql';
 migrations.push({order:30.5,source:language,sha256:hash(fs.readFileSync(path.join(root,language))),approved:false,productionCompatible:false,needsTargetRebase:true});
 migrations.sort((a,b)=>parseInt(path.basename(a.source))-parseInt(path.basename(b.source))||a.source.localeCompare(b.source));
 migrations.forEach((item,index)=>{item.order=index+1;});
 const plan={mode:'OFFLINE_REVIEW_ONLY',productionReady:false,deploymentApproved:false,executed:false,developmentDataCopied:false,hostAudited:false,domain:'vetthevat.com',provider:'serververse',database:'vtv_saas_production',postgresMajor:17,proposedApplicationPort:3200,applicationPortVerifiedUnused:false,postgresPort:null,postgresPortVerifiedUnused:false,
  migrationStrategy:'Create an empty VTV-only cluster/database; render separately reviewed production migrations in dependency order. Never run local target scripts unchanged or import development/customer records.',
  sourceInventory:migrations,
  dependencyDecisions:{'003':'Use syntax_fix only; original is superseded.','006':'Use stock_integrity only; original is superseded.','027':'Use corrected 028 for initial price schema; do not create it twice.','030':'Apply web-auth language migration after 029 and before 031.','036':'Both supplier-logo and supplier-invoice-line schemas require separate review; same numeric prefix does not imply identical migration.','041':'Must be paired with the reviewed 042 selection-RLS correction; 041 alone failed forced-RLS rehearsal.'},
  requiredPreflight:['Approved host identity, fresh capacity audit and protected Inovetaa baseline','Fresh dedicated PG17 cluster and empty vtv_saas_production database; refuse existing schemas, roles or records','Offline cluster administrator creates explicit NOLOGIN owners and runtime roles with no owner memberships','Runtime roles never superuser/BYPASSRLS/CREATEDB/CREATEROLE; no PUBLIC CONNECT, CREATE or TEMP','Production target/port/TLS/installation UUID guards replace development-only guards through individually reviewed SQL, never text-wide substitution','Seed only static roles/permissions/reference data and newly generated installation identities from reviewed SQL; zero users, companies, invoices, originals or jobs copied','Preserve FORCE RLS, exact function owners/search_path, revoked PUBLIC EXECUTE and append-only triggers','Fresh production queue activation fence recorded once; preserve development Migration 037 fence unchanged','Schema/ACL/definer/tenant and invoice/ORS acceptance on a fresh disposable production-shaped target','Separate exact-file/hash approval before any production SQL or public enablement'],
  backup:{database:'age-encrypted pg_dump custom archive + off-host rclone verification',originals:'Immutable private-files.py archive after DB snapshot, or separately attested external originals recovery',restore:'Separately approved empty database and new file directory only; never overwrite production',pitrConfigured:false,offHostVerified:false,restoreVerified:false},
  compatibilityBlockers:['No verified VPS audit or spare capacity','No approved production-rebased bootstrap/migration SQL; source inventory is not executable approval','No Linux release artifact on the exact pinned Node runtime','No production TLS/SMTP/storage/backup credentials or recovery acceptance']};
 plan.sameHostReleaseRole='all';
 const preparedSources={};
 function inventory(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(item.name==='__pycache__'||item.name.endsWith('.pyc'))continue;const file=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink in deployment review sources');if(item.isDirectory())inventory(file);else if(!item.name.endsWith('.env'))preparedSources[path.relative(root,file).split(path.sep).join('/')]=hash(fs.readFileSync(file));}}
 inventory(path.join(root,'deploy'));
 fs.writeFileSync(path.join(out,'deployment-source-hashes.json'),JSON.stringify(preparedSources,null,2));
 fs.writeFileSync(path.join(out,'bootstrap-plan.json'),JSON.stringify(plan,null,2));
 const audit=JSON.parse(fs.readFileSync(path.join(root,'deploy/postgres/serververse/host-audit.json.template'),'utf8'));
 fs.writeFileSync(path.join(out,'capacity.json'),JSON.stringify(assess(audit),null,2));
 render('production','vetthevat.com',path.join(out,'cloudflare-mtls'),{port:3200,tlsMode:'cloudflare-mtls'});
 render('production','vetthevat.com',path.join(out,'origin-tls'),{port:3200,tlsMode:'origin-tls'});
 const checksums={};function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else checksums[path.relative(out,file).split(path.sep).join('/')]=hash(fs.readFileSync(file));}}walk(out);
 fs.writeFileSync(path.join(out,'checksums.json'),JSON.stringify(checksums,null,2));return {directory:out,productionReady:false,executed:false,migrations:migrations.length};
}
module.exports={prepare};if(require.main===module)try{console.log(JSON.stringify(prepare(process.argv[2]),null,2));}catch(e){console.error(e.message);process.exitCode=2;}

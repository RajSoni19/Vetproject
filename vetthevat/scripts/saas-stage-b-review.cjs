// Read-only review tool. This script deliberately has NO migration execution mode.
const s=require('./saas-dev-common.cjs'),{Client}=require('pg');
async function review(){
 const manifest=JSON.parse(s.fs.readFileSync(s.path.join(s.root,'database/migrations/saas/stage-b.manifest.json'),'utf8'));
 const appliedSource='database/migrations/saas/003_stage_b_invoices_syntax_fix.review.sql',appliedSha256='0cbf009b4eb221e8c78c277d12899bff070601afbb4227e3aa113f88f26ab2c0';
 const actual=s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(s.root,manifest.migration))).digest('hex');if(actual!==manifest.sha256)throw Error('Stage B SQL checksum mismatch');
 const config=s.configuration(),db=new Client(s.connection('vtv_saas_operator'));await db.connect();
 try{await db.query('BEGIN READ ONLY');const row=(await db.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS cluster,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,to_regnamespace('business') IS NOT NULL AS business_schema_exists")).rows[0];
 if(row.database!=='vtv_saas_dev'||row.host!=='127.0.0.1'||row.port!==55440||s.path.resolve(row.cluster).toLowerCase()!==s.path.resolve(s.directory,'cluster').toLowerCase()||row.installation!==config.installationId)throw Error('Refusing unapproved identity');
 const policies=(await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE schemaname='saas' AND policyname='owner_authorization_lock' AND with_check='false' AND roles=ARRAY['vtv_saas_owner']::name[]")).rows[0].n;if(policies!==2)throw Error('Stage A correction state mismatch');
 for(const [file,hash]of Object.entries(manifest.prerequisiteChecksums)){if(s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(s.root,'database/migrations/saas',file))).digest('hex')!==hash)throw Error('Stage A checksum mismatch');}
 const appliedActual=s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(s.root,appliedSource))).digest('hex');if(appliedActual!==appliedSha256)throw Error('Approved Stage B replacement checksum mismatch');
 await db.query('ROLLBACK');const result={at:new Date().toISOString(),target:{host:row.host,port:row.port,database:row.database,cluster:row.cluster},installationMatched:true,stageAChecksumsMatched:true,correctivePolicies:policies,reviewedMigration:manifest.migration,reviewedSha256:actual,migration:row.business_schema_exists?appliedSource:manifest.migration,sha256:row.business_schema_exists?appliedActual:actual,stageBSchemaExists:row.business_schema_exists,executedMigration:row.business_schema_exists,oldAuthDatabaseConnected:false};
 s.fs.mkdirSync(s.path.join(s.root,'.master-stage-b'),{recursive:true});s.fs.writeFileSync(s.path.join(s.root,'.master-stage-b/review.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));return result;
 }finally{await db.end();}
}
module.exports={review};if(require.main===module)review().catch(e=>{console.error('Read-only Stage B review refused: '+(e.code||e.message));process.exitCode=1;});

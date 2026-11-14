import {Pool} from "pg";
import {loadEnvConfig} from "@next/env";
import {readR2Configuration,r2OriginalStore} from "@/lib/server/providers/r2";
import {localPrivateOriginals} from "@/lib/server/saas/local-originals";
import {migrateLocalDocumentObjects,restoreR2DocumentObjects,type LocalDocumentObject} from "@/lib/server/saas/document-storage-migration";

type MigrationArguments={direction:"to-r2"|"to-local";dryRun:boolean;planHash?:string};
function parseArguments(args:string[]):MigrationArguments{
  if(args.length===0||args.length===1&&args[0]==="--dry-run")return {direction:"to-r2",dryRun:true};
  if(args.length===2&&args[0]==="--apply"&&/^[a-f0-9]{64}$/.test(args[1]))return {direction:"to-r2",dryRun:false,planHash:args[1]};
  if(args.length===1&&args[0]==="--restore-local"||args.length===2&&args[0]==="--restore-local"&&args[1]==="--dry-run")return {direction:"to-local",dryRun:true};
  if(args.length===3&&args[0]==="--restore-local"&&args[1]==="--apply"&&/^[a-f0-9]{64}$/.test(args[2]))return {direction:"to-local",dryRun:false,planHash:args[2]};
  throw new Error("Usage: npm run documents:migrate-r2 -- [--dry-run | --apply <dry-run-plan-hash> | --restore-local [--dry-run | --apply <dry-run-plan-hash>]]");
}
export async function runLocalDocumentR2Migration(args=process.argv.slice(2)){
  const options=parseArguments(args),root=process.cwd();
  loadEnvConfig(root);
  const r2Configuration=readR2Configuration(process.env);
  if(!r2Configuration)throw new Error("Approved R2 credentials and bucket configuration are required for migration.");
  const source=localPrivateOriginals({
    ...process.env,
    SAAS_LOCAL_ORIGINALS_ENABLED:"1",
    SAAS_LOCAL_ORIGINALS_APPROVED:"vtv_saas_dev",
    WEB_AUTH_ENV:"test",
    WEB_AUTH_ORIGIN:"https://localhost:3444",
    SAAS_DATABASE_APPROVED:"vtv_saas_dev"
  },root);
  if(!source)throw new Error("Approved external local storage is unavailable.");
  const common=require("./saas-dev-common.cjs");
  const database=new Pool({...common.connection("vtv_saas_operator"),max:1,application_name:"vtv-local-document-r2-migration",query_timeout:30000,statement_timeout:30000});
  let items:LocalDocumentObject[];
  try{
    const client=await database.connect();
    try{
      await client.query("BEGIN READ ONLY");
      const identity=(await client.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,replace(current_setting('data_directory'),E'\\\\','/') AS data_directory,(SELECT installation_id::text FROM business.migrations WHERE version=3) AS installation")).rows[0];
      const approved=common.configuration();
      if(!identity||identity.database!=="vtv_saas_dev"||identity.host!=="127.0.0.1"||identity.port!==55440||identity.role!=="vtv_saas_operator"||identity.session_role!==identity.role||identity.data_directory!=="D:/vetthevat.saas-dev/cluster"||identity.installation!==approved.installationId)throw new Error("Protected database identity did not match the approved local development target.");
      const incomplete=Number((await client.query("SELECT count(*)::text AS count FROM saas.documents WHERE object_version IS NULL")).rows[0]?.count??"0");
      if(incomplete!==0)throw new Error("Database contains incomplete document uploads; reconcile them before migration.");
      const rows=(await client.query("SELECT id::text,company_id::text,object_key,object_version,sha256,byte_size::text,mime_type FROM saas.documents WHERE object_version IS NOT NULL ORDER BY company_id,id LIMIT 100001")).rows;
      if(rows.length>100000)throw new Error("Document inventory exceeds the supported migration limit.");
      items=rows.map(row=>({
        documentId:String(row.id).toLowerCase(),
        companyId:String(row.company_id).toLowerCase(),
        mime:String(row.mime_type) as LocalDocumentObject["mime"],
        original:{key:String(row.object_key),version:String(row.object_version),sha256:String(row.sha256),byteSize:Number(row.byte_size)}
      }));
      await client.query("COMMIT");
    }catch(error){try{await client.query("ROLLBACK");}catch{}throw error;}
    finally{client.release();}
  }finally{await database.end();}
  const r2=r2OriginalStore(r2Configuration);
  const result=options.direction==="to-r2"
    ?await migrateLocalDocumentObjects(items,source,r2,{
      dryRun:options.dryRun,
      expectedPlanHash:options.planHash,
      destination:`${r2Configuration.accountId}/${r2Configuration.bucket}`
    })
    :await restoreR2DocumentObjects(items,r2,source,{
      dryRun:options.dryRun,
      expectedPlanHash:options.planHash,
      destination:"configured-private-local-store"
    });
  return {
    ...result,
    mode:`${options.direction}-${options.dryRun?"dry-run":"copy-and-verify"}`,
    databaseMetadataChanged:false,
    localOriginalsDeleted:false,
    readsSwitched:false,
    cutoverReady:options.direction==="to-r2"&&!options.dryRun&&result.verifiedObjectCount===result.objectCount,
    rollbackReady:options.direction==="to-local"&&!options.dryRun&&result.verifiedObjectCount===result.objectCount,
    nextStep:options.dryRun?"Review this plan, then rerun with --apply and this planHash.":options.direction==="to-r2"?"Only switch R2_ENABLED after verifiedObjectCount matches objectCount.":"Only switch reads back to local after verifiedObjectCount matches objectCount."
  };
}

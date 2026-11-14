import "server-only";
import {Pool} from "pg";
import {managedDatabase,readManagedDeployment,readLocalDocumentWorker} from "@/lib/server/deployment-profile";
import {postgresTls} from "@/lib/server/postgres-tls";
import {privateAssets} from "@/lib/server/saas/storage-runtime";
import {processingRequest} from "@/lib/server/saas/document-runtime";
import {supplierLogoWorkerStore,processSupplierLogoJob} from "@/lib/server/saas/supplier-logo-worker";

export async function runSupplierLogoWorker(signal:AbortSignal,env:Readonly<Record<string,string|undefined>>=process.env){
  const deployment=readManagedDeployment(env),local=readLocalDocumentWorker(env),database=managedDatabase(env,env.DOCUMENT_WORKER_DATABASE_URL,"vtv_saas_document_worker")??(local?{...local,tls:false as const}:undefined),socket=env.DOCUMENT_PROCESSING_SOCKET;
  if((!deployment&&!local)||!database||env.DOCUMENT_WORKER_ENABLED!=="1"||socket!==(deployment?`/run/vetthevat-${deployment.profile}/processing.sock`:`/run/user/${env.VTV_LOCAL_WORKER_UID}/vtv-document-worker/processing.sock`))return {state:"disabled"};
  const assets=privateAssets();if(!assets)return {state:"disabled"};
  const pool=new Pool({host:database.host,port:database.port,database:database.name,user:database.user,password:database.password,ssl:postgresTls(database),max:1,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,application_name:"vtv-supplier-logo-worker"});pool.on("error",()=>{});
  try{
    const client=await pool.connect();
    try{
      const store=supplierLogoWorkerStore({query:async(sql,values)=>{const result=await client.query(sql,values);return {rows:result.rows,rowCount:result.rowCount};}},deployment?.installationId??local!.installationId,deployment?{databaseName:database.name,host:database.host,client}:undefined,local?{host:local.host}:undefined);
      return await processSupplierLogoJob(store,assets,{inspect:async(bytes,mime,abort)=>processingRequest(socket,"/inspect",bytes,mime,abort)},signal);
    }finally{client.release(true);}
  }finally{await pool.end();}
}

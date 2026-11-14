import "server-only";
import {Pool} from "pg";
import {request} from "node:http";
import {managedDatabase,readManagedDeployment,readLocalDocumentWorker} from "@/lib/server/deployment-profile";
import {postgresTls} from "@/lib/server/postgres-tls";
import {documentWorkerStore} from "@/lib/server/saas/worker-store";
import {processDocumentJob} from "@/lib/server/saas/document-worker";
import {privateOriginals} from "@/lib/server/saas/storage-runtime";

export function processingRequest(socketPath:string,path:'/inspect'|'/ocr',bytes:Uint8Array,mime:string,signal:AbortSignal):Promise<any>{
 if(!/^\/run\/vetthevat-(staging|production)\/processing\.sock$/.test(socketPath)&&!/^\/run\/user\/\d+\/vtv-document-worker\/processing\.sock$/.test(socketPath))return Promise.reject(Error('Unapproved processing socket'));
 return new Promise((resolve,reject)=>{const req=request({socketPath,path,method:'POST',headers:{'content-type':mime,'content-length':bytes.length},signal},response=>{const chunks:Buffer[]=[];let length=0;response.on('data',chunk=>{length+=chunk.length;if(length>1100000){req.destroy();reject(Error('Processing response exceeded bounds'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>{try{if(response.statusCode!==200)throw Error('Processing failed');resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('Processing result unavailable'));}});});req.on('error',reject);req.end(bytes);});
}
export async function runDocumentWorker(kind:'inspect'|'extract',signal:AbortSignal,env:Readonly<Record<string,string|undefined>>=process.env){
 const deployment=readManagedDeployment(env),local=readLocalDocumentWorker(env),database=managedDatabase(env,env.DOCUMENT_WORKER_DATABASE_URL,'vtv_saas_document_worker')??(local?{...local,tls:false as const}:undefined),socket=env.DOCUMENT_PROCESSING_SOCKET;
 const fence=env.VTV_DOCUMENT_CREATED_AFTER;
 if(deployment?.provider==='serververse'&&(!fence||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(fence)||!Number.isFinite(Date.parse(fence))))return {state:'disabled'};
 if((!deployment&&!local)||!database||env.DOCUMENT_WORKER_ENABLED!=='1'||socket!==(deployment?`/run/vetthevat-${deployment.profile}/processing.sock`:`/run/user/${env.VTV_LOCAL_WORKER_UID}/vtv-document-worker/processing.sock`))return {state:'disabled'};
 const originals=privateOriginals();if(!originals)return {state:'disabled'};
 const pool=new Pool({host:database.host,port:database.port,database:database.name,user:database.user,password:database.password,ssl:postgresTls(database),max:1,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,application_name:'vtv-document-worker'});pool.on('error',()=>{});
 try{const client=await pool.connect();try{return await processDocumentJob(kind,documentWorkerStore({query:async(sql,values)=>{const r=await client.query(sql,values);return {rows:r.rows,rowCount:r.rowCount};}},deployment?.installationId??local!.installationId,deployment?{databaseName:database.name,host:database.host,client,createdAfter:deployment.provider==='serververse'?fence:undefined}:undefined,local?{host:local.host}:undefined),originals,{inspection:{inspect:async(bytes,mime,abort)=>processingRequest(socket,'/inspect',bytes,mime,abort)},ocr:{engine:'isolated-poppler-tesseract-v1',pages:async(bytes,mime,abort)=>(await processingRequest(socket,'/ocr',bytes,mime,abort)).pages}},signal);}finally{client.release(true);}}finally{await pool.end();}
}

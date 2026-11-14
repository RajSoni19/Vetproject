import {createHash} from "node:crypto";
import {ApiError,uuid} from "@/lib/server/api-v1";
import {checkPrivateAsset,supplierLogoKey,type PrivateAssetStore,type StoredPrivateAsset,type SupplierLogoMime} from "@/lib/server/saas/object-storage";
import type {Inspection,TrustedInspectionPort} from "@/lib/server/saas/document-worker";
import type {WorkerConnection} from "@/lib/server/saas/worker-store";
import {assertPostgresTransport} from "@/lib/server/postgres-tls";
import type {LocalDocumentWorker} from "@/lib/server/deployment-profile";

type SupplierLogoLease={jobId:string;leaseId:string;companyId:string;supplierId:string;assetId:string;asset:StoredPrivateAsset};
export interface SupplierLogoWorkerStore{
 claim():Promise<SupplierLogoLease|null>;
 finish(lease:SupplierLogoLease,receipt:Inspection):Promise<boolean>;
}
export function supplierLogoWorkerStore(connection:WorkerConnection,installation:string,managed?:{databaseName:string;host:string;client:unknown},local?:Pick<LocalDocumentWorker,"host">):SupplierLogoWorkerStore{
  async function preflight(){
    if(managed)assertPostgresTransport(managed.client,managed.host);
    const row=(await connection.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT installation_id::text FROM business.supplier_logo_schema_version WHERE singleton) AS installation,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];
    if(!row||row.database!==(managed?managed.databaseName:"vtv_saas_dev")||(!managed&&(!local&&(row.host!=="127.0.0.1"||row.port!==55440)||local&&(row.host!==local.host||row.port!==55440)))||row.role!=="vtv_saas_document_worker"||row.session_role!==row.role||row.installation!==installation||row.safe!==true)throw new ApiError(503,"UNAVAILABLE","Supplier image worker database identity mismatch.");
  }
  return {
    async claim(){
      await preflight();
      const row=(await connection.query("SELECT * FROM business.claim_supplier_logo_inspection()")).rows[0];
      if(!row)return null;
      const companyId=uuid(row.company_id),supplierId=uuid(row.supplier_id),assetId=uuid(row.asset_id);
      const asset:StoredPrivateAsset={key:String(row.object_key),version:String(row.object_version),sha256:String(row.sha256),mime:String(row.mime_type) as SupplierLogoMime,byteSize:Number(row.byte_size)};
      checkPrivateAsset(asset);
      if(asset.key!==supplierLogoKey(companyId,supplierId,assetId,asset.sha256))throw new ApiError(503,"UNAVAILABLE","Supplier image worker identity mismatch.");
      return {jobId:uuid(row.job_id),leaseId:uuid(row.lease_id),companyId,supplierId,assetId,asset};
    },
    async finish(lease,receipt){
      await preflight();
      return (await connection.query("SELECT business.finish_supplier_logo_inspection($1,$2,$3,$4,$5) AS accepted",[lease.jobId,lease.leaseId,receipt.verdict,receipt.engine,receipt.policy])).rows[0]?.accepted===true;
    }
  };
}
export async function processSupplierLogoJob(store:SupplierLogoWorkerStore,storage:PrivateAssetStore,inspection:TrustedInspectionPort,signal:AbortSignal){
  signal.throwIfAborted();
  const lease=await store.claim();if(!lease)return {state:"idle" as const};
  const timeout=AbortSignal.timeout(90000),bounded=AbortSignal.any([signal,timeout]);
  let receipt:Inspection={verdict:"error",engine:"unavailable",policy:"supplier-logo-v1"};
  try{
    bounded.throwIfAborted();
    const bytes=await storage.readAsset(lease.asset);
    if(bytes.byteLength!==lease.asset.byteSize||createHash("sha256").update(bytes).digest("hex")!==lease.asset.sha256)throw Error("Supplier image integrity mismatch");
    const result=await inspection.inspect(bytes,lease.asset.mime,bounded);
    if(!result||!["clean","infected","error"].includes(result.verdict)||typeof result.engine!=="string"||result.engine.length<1||result.engine.length>200||typeof result.policy!=="string"||result.policy.length<1||result.policy.length>100)throw Error("Invalid supplier image inspection receipt");
    bounded.throwIfAborted();receipt=result;
  }catch{
    receipt={verdict:"error",engine:bounded.aborted?"timeout":"unavailable",policy:"supplier-logo-v1"};
  }
  if(!await store.finish(lease,receipt))throw new ApiError(409,"CONFLICT","Supplier image scan lease expired or was replaced.");
  return {state:receipt.verdict};
}

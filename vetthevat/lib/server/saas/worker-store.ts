import {ApiError} from "@/lib/server/api-v1";
import {validateLease,type WorkerStore,type DocumentLease} from "@/lib/server/saas/document-worker";
import type {Result} from "@/lib/server/saas/transactions";
import {assertPostgresTransport} from "@/lib/server/postgres-tls";
import type {LocalDocumentWorker} from "@/lib/server/deployment-profile";

export interface WorkerConnection {query(sql:string,values?:unknown[]):Promise<Result>;}
// Adapter is intentionally not constructed by Next.js. The isolated worker host
// must verify exact database/installation/role before supplying its connection.
export function documentWorkerStore(connection:WorkerConnection,installation:string,managed?:{databaseName:string;host:string;client:unknown;createdAfter?:string},local?:Pick<LocalDocumentWorker,'host'>,uat?:{databaseName:string;runId:string}):WorkerStore{
  async function preflight(){
    if(managed)assertPostgresTransport(managed.client,managed.host);
    const row=(await connection.query("SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,(SELECT installation_id::text FROM business.migrations WHERE version=3) AS installation,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];
    if(uat&&(!/^vtv_uat_\d{14}_[a-f0-9]{8}$/.test(uat.databaseName)||!/^[a-f0-9-]{36}$/.test(uat.runId)||managed||local))throw new ApiError(503,'UNAVAILABLE','Invalid isolated worker profile.');
    if(!row||row.database!==(managed?managed.databaseName:uat?.databaseName??"vtv_saas_dev")||(!managed&&(!local&&(row.host!=="127.0.0.1"||row.port!==55440)||local&&(row.host!==local.host||row.port!==55440)))||row.role!=="vtv_saas_document_worker"||row.session_role!==row.role||row.installation!==installation||row.safe!==true)throw new ApiError(503,"UNAVAILABLE","Worker database identity mismatch.");
    if(!managed||managed.createdAfter){
      const fence=(await connection.query("SELECT created_after FROM business.local_document_scope WHERE singleton")).rows;
      const expected=managed?.createdAfter??"2026-10-30T16:50:33.492Z";
      const value=fence[0]?.created_after,actual=value instanceof Date?value.toISOString():typeof value==="string"?new Date(value).toISOString():"";
      if(fence.length!==1||actual!==expected)throw new ApiError(503,"UNAVAILABLE","New-upload activation fence differs; no job may be claimed.");
    }
  }
  return {
    async claim(kind){await preflight();const sql=!managed||managed.createdAfter?(kind==='inspect'?'SELECT * FROM business.claim_local_inspection()':'SELECT * FROM business.claim_local_extraction()'):(kind==="inspect"?"SELECT * FROM business.claim_inspection()":"SELECT * FROM business.claim_extraction()");const row=(await connection.query(sql)).rows[0];if(!row)return null;
      const lease:DocumentLease={jobId:String(row.job_id),leaseId:String(row.lease_id),companyId:String(row.company_id),documentId:String(row.document_id),mime:row.mime_type as DocumentLease["mime"],original:{key:String(row.object_key),version:String(row.object_version),sha256:String(row.sha256),byteSize:Number(row.byte_size)}};validateLease(lease);return lease;},
    async finishInspection(lease,receipt){validateLease(lease);await preflight();return (await connection.query("SELECT business.finish_inspection($1,$2,$3,$4,$5) AS accepted",[lease.jobId,lease.leaseId,receipt.verdict,receipt.engine,receipt.policy])).rows[0]?.accepted===true;},
    async finishExtraction(lease,pages,engine,failure){validateLease(lease);await preflight();return (await connection.query("SELECT business.finish_extraction($1,$2,$3::jsonb,$4,$5) AS accepted",[lease.jobId,lease.leaseId,pages===null?null:JSON.stringify(pages),engine,failure])).rows[0]?.accepted===true;}
  };
}

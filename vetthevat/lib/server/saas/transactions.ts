import {ApiError,uuid} from "@/lib/server/api-v1";
import {validToken,tokenHash} from "@/lib/server/web-auth/crypto";
import {companyPermission,type CompanyPermission} from "@/lib/server/saas/permissions";
import type {SaasConfiguration} from "@/lib/server/saas/config";
import {assertPostgresTransport} from "@/lib/server/postgres-tls";

export type Result={rows:Record<string,unknown>[];rowCount:number|null;command?:string};
export interface Connection {query(text:string,values?:unknown[]):Promise<Result>;release(destroy?:boolean):void;}
export interface PoolPort {connect():Promise<Connection>;}
export interface CompanyTransaction {query(text:string,values?:unknown[]):Promise<Result>;readonly actorId:string;readonly companyId:string;readonly sessionId:string;readonly permission:CompanyPermission;}
export type CompanyScope={sessionCookie:string;companyId:string;permission:CompanyPermission;snapshot?:true};
export interface CompanyDatabase {scoped<T>(scope:CompanyScope,operation:(tx:CompanyTransaction)=>Promise<T>):Promise<T>;}
export const saasPreflight=`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
 inet_server_addr()::text AS address,inet_server_port() AS port,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
 (SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,
 NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid)
 AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=pg_roles.oid)
 AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=pg_roles.oid)
 AND NOT has_database_privilege(current_user,current_database(),'CREATE')
 AND NOT has_database_privilege(current_user,current_database(),'TEMP') AS safe
 FROM pg_roles WHERE rolname=current_user`;

export function createCompanyDatabase(pool:PoolPort,config:SaasConfiguration):CompanyDatabase {
  return {async scoped(scope,operation){
    // Validate before obtaining a connection. No email/role/user ID is supplied.
    if(!validToken(scope.sessionCookie))throw new ApiError(401,"UNAUTHENTICATED","Sign in required.");
    const company=uuid(scope.companyId).toLowerCase(),permission=companyPermission(scope.permission);
    let client:Connection;
    try{client=await pool.connect();}catch{throw new ApiError(503,"UNAVAILABLE","Business storage is unavailable.");}
    let closed=false,busy=false,misuse=false,destroy=false,failed=false,pending:Promise<Result>|undefined;
    try{
      if(config.managed)assertPostgresTransport(client,config.database.host);
      if(!(client as unknown as Record<string,boolean>)._vtvVerified){
        const row=(await client.query(saasPreflight)).rows[0];
        if(!row||row.database!==config.database.name||row.role!==config.database.user||row.session_role!==row.role||(config.database.port&&row.port&&row.port!==config.database.port)||(row.installation&&row.installation!==config.installationId)||(config.database.host==='127.0.0.1'&&Boolean(row.address)&&!String(row.address).startsWith('127.0.0.1')))throw new ApiError(503,"UNAVAILABLE","Business storage identity could not be verified.");
        if(config.managed&&(row.installation!==config.installationId||row.safe!==true))throw new ApiError(503,"UNAVAILABLE","Business storage identity could not be verified.");
        (client as unknown as Record<string,boolean>)._vtvVerified=true;
      }
      // BEGIN, request context and the authorization lock in ONE round trip
      // (each round trip to a remote database costs 100ms+). Inlining is safe
      // only because every value is re-checked against a closed pattern here.
      const hash=tokenHash(scope.sessionCookie);
      if(!/^[a-f0-9]{64}$/.test(hash)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(company)||!/^[a-z]+:[a-z]+$/.test(permission))throw new ApiError(403,"FORBIDDEN","Company permission required.");
      const opened=await client.query(`${scope.snapshot?"BEGIN ISOLATION LEVEL REPEATABLE READ":"BEGIN ISOLATION LEVEL READ COMMITTED"};SELECT set_config('app.session_hash','${hash}',true),set_config('app.company_id','${company}',true),set_config('app.permission','${permission}',true);SELECT actor_id::text,session_id::text FROM saas.lock_authorization('${company}'::uuid,'${permission}')`) as unknown as Result|Result[];
      const actor=(Array.isArray(opened)?opened[opened.length-1]:opened).rows[0];
      if(!actor)throw new ApiError(403,"FORBIDDEN","Company permission required.");
      const tx:CompanyTransaction={actorId:uuid(actor.actor_id),sessionId:uuid(actor.session_id),companyId:company,permission,query(text,values){
        if(closed)return Promise.reject(new ApiError(503,"UNAVAILABLE","Transaction is closed."));
        if(busy){misuse=true;return Promise.reject(new ApiError(503,"UNAVAILABLE","Parallel transaction queries are not allowed."));}
        busy=true;
        pending=client.query(text,values).catch((error:unknown)=>{failed=true;if(error&&typeof error==="object"&&"code" in error&&error.code==="23505"&&"constraint" in error&&error.constraint==="invoice_duplicate_identity")throw new ApiError(409,"CONFLICT","An invoice with this supplier/customer, direction, kind and invoice number already exists. Open the existing record instead of adding it again.");if(error&&typeof error==="object"&&"code" in error&&error.code==="23514"&&"constraint" in error&&error.constraint==="platform_document_quota")throw new ApiError(409,"CONFLICT","The monthly document OCR allowance has been reached for this billing account. Review your plan or contact support.");throw new ApiError(503,"UNAVAILABLE","Business query failed.");}).finally(()=>{busy=false;});
        void pending.catch(()=>{});return pending;
      }};
      const result=await operation(tx);closed=true;
      if(busy&&pending){await pending;misuse=true;}
      if(failed||misuse)throw new ApiError(503,"UNAVAILABLE","Transaction could not be completed.");
      // COMMIT may fail with unknown outcome: never retry the callback here.
      destroy=true;const committed=await client.query("COMMIT");
      if(committed.command!=="COMMIT")throw new ApiError(503,"UNAVAILABLE","Transaction was not committed.");
      destroy=false;return result;
    }catch(error){
      closed=true;destroy=true;if(busy&&pending){try{await pending;}catch{}}
      try{await client.query("ROLLBACK");}catch{}
      if(error instanceof ApiError)throw error;
      throw new ApiError(503,"UNAVAILABLE","Business storage is unavailable.");
    }finally{closed=true;client.release(destroy);}
  }};
}

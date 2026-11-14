import "server-only";
import {Pool} from "pg";
import {ApiError} from "@/lib/server/api-v1";
import {postgresProviderInbox} from "@/lib/server/providers/postgres-inbox";
import {readProviderRuntimeConfiguration} from "@/lib/server/providers/runtime-config";
export {readProviderRuntimeConfiguration} from "@/lib/server/providers/runtime-config";

import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";
const preflight=`SELECT current_database() AS database,current_user AS role,session_user AS session_role,
 inet_server_addr()::text AS address,inet_server_port() AS port,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,
 (SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,
 NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid)
 AND NOT has_database_privilege(current_user,current_database(),'CREATE')
 AND NOT has_database_privilege(current_user,current_database(),'TEMP')
 AND has_function_privilege(current_user,'saas.record_provider_event(text,text,char(64),jsonb)','EXECUTE')
 AND NOT has_table_privilege(current_user,'saas.provider_events','SELECT')
 AND NOT has_table_privilege(current_user,'saas.provider_events','INSERT') AS safe
 FROM pg_roles WHERE rolname=current_user`;

export function providerInboxRuntime(env:Readonly<Record<string,string|undefined>>=process.env){
 const config=readProviderRuntimeConfiguration(env);if(!config)return undefined;
 const pool=new Pool({host:config.database.host,port:config.database.port,database:config.database.name,user:config.database.user,password:config.database.password,ssl:postgresTls(config.database),max:2,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:8000,idleTimeoutMillis:10000,idle_in_transaction_session_timeout:10000,maxLifetimeSeconds:300,application_name:"vtv-provider-inbox-development"});
 pool.on("error",()=>{});
 const connection={async query(sql:string,values:readonly unknown[]){
  const client=await pool.connect();let failed=true;
  try{
   if(config.managed)assertPostgresTransport(client,config.database.host);
   const row=(await client.query(preflight)).rows[0];
   if(!row||row.database!==config.database.name||row.role!==config.database.user||row.session_role!==row.role||(!config.managed&&((row.address!=="127.0.0.1"&&row.address!=="127.0.0.1/32")||row.port!==55440))||row.installation!==config.installationId||row.safe!==true)throw Error();
   const result=await client.query(sql,[...values]);failed=false;return result;
  }catch{throw new ApiError(503,"UNAVAILABLE","Provider event storage is unavailable.");}finally{client.release(failed);}
 }};
 return {inbox:postgresProviderInbox(connection),close:()=>pool.end()};
}

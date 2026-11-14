import "server-only";
import { Pool } from "pg";
import { readWebAuthConfig,type WebAuthConfig } from "@/lib/server/web-auth/config";
import { WebAuthStore,type Transaction } from "@/lib/server/web-auth/store";
import { ApiError } from "@/lib/server/api-v1";
import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";

export type WebAuthServices={config:WebAuthConfig;store:WebAuthStore};
let cached:{key:string;services:WebAuthServices}|undefined;
export function webAuthServices():WebAuthServices|undefined{
 const config=readWebAuthConfig(process.env);if(!config)return undefined;
 const key=JSON.stringify(config);if(cached?.key===key)return cached.services;
 const pool=new Pool({host:config.database.host,port:config.database.port,database:config.database.name,user:config.database.user,password:config.database.password,ssl:postgresTls(config.database),max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:60000,query_timeout:8000,statement_timeout:8000,idle_in_transaction_session_timeout:10000,maxLifetimeSeconds:300,application_name:"vetthevat-web-auth"});pool.on("error",()=>{});
 // Authentication always uses the configured database; no in-memory substitute.
 const transaction:Transaction=async operation=>{
  let client;
  try{client=await pool.connect();}catch{throw new ApiError(503,"UNAVAILABLE","Authentication storage is unavailable.");}
  let destroy=false;try{
   if(config.managed)assertPostgresTransport(client,config.database.host);
   if(!(client as unknown as Record<string,boolean>)._vtvVerified){
    const row=(await client.query("SELECT current_database() AS db,current_user AS role,session_user AS session_role,(SELECT id::text FROM web_auth.installation WHERE version=1) AS installation,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=pg_roles.oid) AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];
    if(config.managed){
     if(!row||row.db!==config.database.name||row.role!=="vtv_web_runtime"||row.session_role!==row.role||row.installation!==config.installationId||row.safe!==true)throw Error();
    }else if(!row||row.db!==config.database.name){throw Error();}
    (client as unknown as Record<string,boolean>)._vtvVerified=true;
   }
   await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");const result=await operation(client);const committed=await client.query("COMMIT");if(committed.command!=="COMMIT")throw Error();return result;
  }catch(error){destroy=true;try{await client.query("ROLLBACK");}catch{}if(error instanceof ApiError)throw error;throw new ApiError(503,"UNAVAILABLE","Authentication storage is unavailable.");}finally{client.release(destroy);}};
 const services={config,store:new WebAuthStore(transaction)};cached={key,services};return services;
}

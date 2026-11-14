import "server-only";
import {Pool} from "pg";
import {readSaasConfiguration} from "@/lib/server/saas/config";
import {createCompanyDatabase} from "@/lib/server/saas/transactions";

import {postgresTls} from "@/lib/server/postgres-tls";
let cached:{key:string;database:ReturnType<typeof createCompanyDatabase>}|undefined;
// Opt-in local target only. No migration, provider call or connection on import.
export function saasDatabase(){
  const config=readSaasConfiguration(process.env);if(!config)return undefined;
  const key=JSON.stringify(config);if(cached?.key===key)return cached.database;
  const pool=new Pool({host:config.database.host,port:config.database.port,database:config.database.name,user:config.database.user,password:config.database.password,
    ssl:postgresTls(config.database),max:10,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:8000,idleTimeoutMillis:60000,idle_in_transaction_session_timeout:10000,maxLifetimeSeconds:300,application_name:"vtv-saas-development"});
  pool.on("error",()=>{});const database=createCompanyDatabase(pool,config);cached={key,database};return database;
}

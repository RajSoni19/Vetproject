import "server-only";
import {timingSafeEqual} from "node:crypto";
import {Pool} from "pg";
import {readManagedDeployment,managedDatabase} from "@/lib/server/deployment-profile";
import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";
import {readR2Configuration,r2SafetyAudit} from "@/lib/server/providers/r2";
import {serverversePrivateOriginals} from "@/lib/server/saas/serververse-originals";
export function healthAuthorized(header:string|null,expected:string|undefined){const supplied=header?.startsWith('Bearer ')?header.slice(7):'';if(!expected||expected.length<32)return false;const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export async function managedReadiness(env:Readonly<Record<string,string|undefined>>=process.env){
 const deployment=readManagedDeployment(env),database=managedDatabase(env,env.SAAS_DATABASE_URL,'vtv_saas_runtime');if(!deployment||!database)return {ready:false,database:false,storage:false};
 const pool=new Pool({host:database.host,port:database.port,database:database.name,user:database.user,password:database.password,ssl:postgresTls(database),max:1,connectionTimeoutMillis:3000,query_timeout:3000,application_name:'vtv-readiness'});pool.on('error',()=>{});let db=false,storage=false;
 try{const client=await pool.connect();try{assertPostgresTransport(client,database.host);const row=(await client.query("SELECT current_database() AS db,current_user AS role,session_user AS session_role,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];db=row?.db===database.name&&row.role===database.user&&row.session_role===row.role&&row.installation===deployment.installationId&&row.safe===true;}finally{client.release(true);}}catch{}finally{await pool.end();}
 try{if(env.VTV_PRIVATE_ORIGINALS_ENABLED==='1'){storage=env.R2_ENABLED!=='1'&&env.SAAS_OBJECT_STORAGE_ENABLED!=='1'&&Boolean(serverversePrivateOriginals(env));}else{const r2=readR2Configuration(env);if(r2){await r2SafetyAudit(r2)();storage=true;}}}catch{}
 // This proves DB identity/TLS and private bucket policy only. Worker heartbeats,
 // object read/write, OCR/SMTP/Stripe and tenant acceptance are separate gates.
 return {ready:db&&storage,database:db,storage};
}

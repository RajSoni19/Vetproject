import {localUat} from "@/lib/server/local-uat";
import {uatContactServices} from "@/lib/server/uat-contact";
import "server-only";
import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";
import {Pool} from "pg";
import {readContactConfiguration} from "@/lib/server/contact-config";
import {postgresContactStore} from "@/lib/server/contact-postgres";
import {contactBotVerifier} from "@/lib/server/contact-providers";
import type {ContactServices} from "@/lib/server/contact";
import type {LeadDatabase} from "@/lib/server/leads/postgres";
let cached:{key:string;services:ContactServices}|undefined;
export function contactFormConfiguration(){if(localUat(process.env))return {enabled:true,siteKey:"local-uat-signed-challenge"};const config=readContactConfiguration(process.env);if(!config&&singleDatabaseContact(process.env))return {enabled:true,siteKey:undefined};return {enabled:true,siteKey:config?.siteKey};}
// Single-database mode: enquiries go into the main database (contact_intake schema).
// Protected by rate limits, a hidden spam-trap field and exact-origin checks; no
// Turnstile keys are needed. Enabled with CONTACT_ENABLED=1 and CONTACT_SINGLE_DATABASE=1.
function singleDatabaseContact(env:Readonly<Record<string,string|undefined>>){return env.CONTACT_ENABLED==='1'&&env.CONTACT_SINGLE_DATABASE==='1'&&!!env.DATABASE_URL&&(env.CONTACT_HASH_SECRET??'').length>=32&&!!env.WEB_AUTH_ORIGIN;}
let simple:{pool:Pool;services:ContactServices}|undefined;
function singleDatabaseServices():ContactServices|undefined{
 const env=process.env;if(!singleDatabaseContact(env))return undefined;if(simple)return simple.services;
 const pool=new Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:8000,idleTimeoutMillis:10000,application_name:'vtv-contact'});pool.on('error',()=>{});
 const database:LeadDatabase={async transaction(work){const db=await pool.connect();let destroy=false;try{await db.query('BEGIN');const result=await work({query:async(sql,values)=>({rows:(await db.query(sql,values?[...values]:[])).rows})});if((await db.query('COMMIT')).command!=='COMMIT')throw Error('Unknown contact commit');return result;}catch(e){destroy=true;try{await db.query('ROLLBACK');}catch{}throw e;}finally{db.release(destroy);}}};
 const allowed=[env.WEB_AUTH_ORIGIN!,...(env.WEB_AUTH_EXTRA_ORIGINS??'').split(',').map(v=>v.trim()).filter(Boolean)];
 const services:ContactServices={origin:env.WEB_AUTH_ORIGIN!,secret:env.CONTACT_HASH_SECRET!,store:postgresContactStore(database),verifyBot:async()=>true,
  allowOrigin:request=>{const origin=request.headers.get('origin');return !!origin&&allowed.includes(origin)&&request.headers.get('sec-fetch-site')!=='cross-site';},
  networkKey:request=>request.headers.get('cf-connecting-ip')??request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'direct'};
 simple={pool,services};return services;
}
export function configuredContactRuntime():ContactServices|undefined{
 if(localUat(process.env))return uatContactServices();
 const config=readContactConfiguration(process.env);if(!config)return singleDatabaseServices();const key=JSON.stringify(config);if(cached?.key===key)return cached.services;
 const pool=new Pool({host:config.database.host,port:config.database.port,database:config.database.name,user:config.database.user,password:config.database.password,ssl:postgresTls(config.database),max:2,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:8000,idleTimeoutMillis:10000,idle_in_transaction_session_timeout:10000,application_name:'vtv-contact-development'});pool.on('error',()=>{});
 const database:LeadDatabase={async transaction(work){const db=await pool.connect();let destroy=false;try{if(config.managed)assertPostgresTransport(db,config.database.host);const row=(await db.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AND NOT has_table_privilege(current_user,'contact_intake.enquiries','SELECT') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];if(!row||row.db!==config.database.name||(!config.managed&&(row.host!=='127.0.0.1'||row.port!==55440))||row.role!=='vtv_contact_runtime'||row.session_role!==row.role||row.safe!==true)throw Error('Contact runtime identity mismatch');if(config.managed&&(await db.query('SELECT contact_intake.runtime_identity()::text AS installation')).rows[0]?.installation!==config.installationId)throw Error('Contact installation mismatch');await db.query('BEGIN');const result=await work({query:async(sql,values)=>({rows:(await db.query(sql,values?[...values]:[])).rows})});destroy=true;if((await db.query('COMMIT')).command!=='COMMIT')throw Error('Unknown contact commit');destroy=false;return result;}catch(e){destroy=true;try{await db.query('ROLLBACK');}catch{}throw e;}finally{db.release(destroy);}}};
 const services:ContactServices={origin:config.origin,secret:config.secret,store:postgresContactStore(database),verifyBot:contactBotVerifier(config.botSecret,new URL(config.origin).hostname),networkKey:()=>config.managed?'managed-conservative-network':'local-development-network'};cached={key,services};return services;
}

import {Pool} from "pg";
import {managedDatabase,readManagedDeployment} from "@/lib/server/deployment-profile";
import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";
import {contactWorkerSchemaSha256} from "@/lib/server/contact-config";
import {readSmtpConfiguration,smtpMailer} from "@/lib/server/providers/smtp";
import {processContactNotice,type ContactNotice} from "@/lib/server/contact-notifications";
export async function runContactWorker(signal:AbortSignal,env:Readonly<Record<string,string|undefined>>=process.env){
 const profile=readManagedDeployment(env),database=managedDatabase(env,env.CONTACT_WORKER_DATABASE_URL,'vtv_contact_worker'),smtp=readSmtpConfiguration(env),recipient=env.CONTACT_NOTIFICATION_TO;
 if(!profile||!database||!smtp||env.CONTACT_NOTIFICATION_ENABLED!=='1'||env.CONTACT_RUNTIME_SCHEMA_SHA256!==contactWorkerSchemaSha256||!recipient||recipient!==env.CONTACT_NOTIFICATION_APPROVED_RECIPIENT||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))return {state:'disabled'};
 const pool=new Pool({host:database.host,port:database.port,database:database.name,user:database.user,password:database.password,ssl:postgresTls(database),max:1,connectionTimeoutMillis:5000,query_timeout:8000,statement_timeout:8000,application_name:'vtv-contact-notification-worker'});pool.on('error',()=>{});
 try{const client=await pool.connect();try{
  assertPostgresTransport(client,database.host);
  const row=(await client.query("SELECT current_database() AS db,current_user AS role,session_user AS session_role,contact_intake.runtime_identity()::text AS installation,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AND NOT has_table_privilege(current_user,'contact_intake.enquiries','SELECT') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(!row||row.db!==database.name||row.role!==database.user||row.session_role!==row.role||row.installation!==profile.installationId||row.safe!==true)throw Error('Contact worker identity mismatch');
  return await processContactNotice({claim:async()=>(await client.query('SELECT contact_intake.claim_notice() AS job')).rows[0]?.job as ContactNotice|null,finish:async(job,id,failed)=>(await client.query('SELECT contact_intake.finish_notice($1,$2,$3,$4) AS accepted',[job.id,job.lease,id,failed])).rows[0]?.accepted===true},smtpMailer(smtp),recipient,signal);
 }finally{client.release(true);}}finally{await pool.end();}
}

import "server-only";
import {Pool} from "pg";
import {ApiError} from "@/lib/server/api-v1";
import {readProviderRuntimeConfiguration} from "@/lib/server/providers/runtime-config";
import {readStripeConfiguration,stripeTestAdapter} from "@/lib/server/providers/stripe";
import {reconcileStripeEvent,type StripeLease,type StripeReconciliationStore} from "@/lib/server/providers/stripe-reconciliation";
import {billingEnabled} from "@/lib/server/saas/billing";
import {postgresTls,assertPostgresTransport} from "@/lib/server/postgres-tls";
export async function runStripeReconciliation(env:Readonly<Record<string,string|undefined>>=process.env){
 const db=readProviderRuntimeConfiguration(env),stripe=readStripeConfiguration(env);if(!billingEnabled(env)||!db||!stripe)return {state:'disabled'};
 const pool=new Pool({host:db.database.host,port:db.database.port,database:db.database.name,user:db.database.user,password:db.database.password,ssl:postgresTls(db.database),max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:10000,idle_in_transaction_session_timeout:10000,application_name:'vtv-stripe-test-worker'});pool.on('error',()=>{});
 try{const client=await pool.connect();try{
  if(db.managed)assertPostgresTransport(client,db.database.host);
  const row=(await client.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,session_user AS session_role,(SELECT installation_id::text FROM saas.schema_version WHERE version=1) AS installation,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls,NOT(rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT has_database_privilege(current_user,current_database(),'TEMP') AND NOT has_table_privilege(current_user,'saas.subscription_entitlements','UPDATE') AS safe FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(!row||row.db!==db.database.name||(!db.managed&&(row.host!=='127.0.0.1'||row.port!==55440))||row.role!=='vtv_saas_provider_runtime'||row.session_role!==row.role||row.installation!==db.installationId||row.safe!==true)throw new ApiError(503,'UNAVAILABLE','Billing worker database identity mismatch.');
  const store:StripeReconciliationStore={async claim(){return (await client.query('SELECT saas.claim_stripe_reconciliation() AS lease')).rows[0].lease as StripeLease|null;},async finish(lease,result){return (await client.query('SELECT saas.finish_stripe_reconciliation($1,$2,$3,$4,$5,$6,$7) AS accepted',[lease.jobId,lease.leaseId,typeof result==='object'&&result?result.subscriptionId:null,typeof result==='object'&&result?result.plan:null,typeof result==='string'?result:result?.status??null,typeof result==='object'&&result?result.orsAddon:false,result===null])).rows[0].accepted===true;}};
  return await reconcileStripeEvent(store,stripeTestAdapter(stripe),stripe);
 }finally{client.release(true);}}finally{await pool.end();}
}

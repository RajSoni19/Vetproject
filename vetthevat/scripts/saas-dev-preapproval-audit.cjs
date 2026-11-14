// Read-only audit of the approved isolated database before trial-migration review.
const s=require('./saas-dev-common.cjs');
const {Client}=require('pg');
async function main(){
 const c=new Client(s.connection('vtv_saas_operator'));await c.connect();
 try{
  const target=(await c.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_user role,session_user session_role,to_regclass('saas.trial_history') trial_history,to_regprocedure('saas.grant_local_test_starter(text,uuid,character)') obsolete_grant")).rows[0];
  if(target.db!=='vtv_saas_dev'||target.host!=='127.0.0.1'||target.port!==55440||target.role!=='vtv_saas_operator'||target.session_role!==target.role)throw Error('Wrong database target');
  const disposableDatabases=(await c.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'vtv_trial_rehearsal_%' OR datname LIKE 'vtv_trial_restore_%'")).rows[0].count;
  const rels=(await c.query(`SELECT n.nspname||'.'||cl.relname AS object,pg_get_userbyid(cl.relowner) owner,cl.relrowsecurity rls_enabled,cl.relforcerowsecurity rls_forced,
    has_table_privilege('vtv_saas_runtime',cl.oid,'SELECT,INSERT,UPDATE,DELETE') runtime_privileges,
    has_table_privilege('vtv_web_runtime',cl.oid,'SELECT,INSERT,UPDATE,DELETE') web_privileges
    FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE (n.nspname,cl.relname) IN (('saas','subscription_entitlements'),('saas','billing_accounts'),('saas','company_profiles'),('saas','onboarding_commands'),('saas','trial_history'),('operations','purchase_requests'),('operations','purchase_orders'),('operations','goods_receipts'),('web_auth','company_memberships')) ORDER BY 1`)).rows;
  const funcs=(await c.query(`SELECT p.oid::regprocedure::text function,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,
    has_function_privilege('vtv_web_runtime',p.oid,'EXECUTE') web_can_execute,has_function_privilege('vtv_saas_runtime',p.oid,'EXECUTE') saas_can_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('provision_company','authorized_company','lock_authorization','owned_billing_accounts') ORDER BY 1`)).rows;
  const policies=(await c.query(`SELECT schemaname||'.'||tablename AS object,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE (schemaname,tablename) IN (('saas','subscription_entitlements'),('saas','billing_accounts'),('saas','company_profiles'),('saas','onboarding_commands'),('operations','purchase_requests'),('operations','purchase_orders'),('operations','goods_receipts')) ORDER BY 1,2`)).rows;
  console.log(JSON.stringify({target:{database:target.db,host:target.host,port:target.port,operatorRoleVerified:target.role==='vtv_saas_operator'},migrationAbsent:target.trial_history===null,obsoleteLocalGrantAbsent:target.obsolete_grant===null,disposableTrialDatabasesLeft:disposableDatabases,relations:rels,functions:funcs,policies},null,2));
 }finally{await c.end();}
}
main().catch(e=>{console.error('Read-only local audit failed:',e.code||e.message);process.exitCode=1;});

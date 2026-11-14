import {localUat} from "@/lib/server/local-uat";
import {readSmtpConfiguration,type SmtpConfiguration} from "@/lib/server/providers/smtp";
import {managedProfileSelected,readManagedDeployment,managedDatabase} from "@/lib/server/deployment-profile";
export type WebAuthConfig={environment:"test"|"development"|"staging"|"production";origin:string;database:{host:string;port:number;name:string;user:string;password:string;tls:boolean;caFile?:string};installationId:string;csrfSecret:string;outboxKey:string;mailApproved:boolean;smtp?:SmtpConfiguration;workerSecret?:string;managed?:boolean};
export function readWebAuthConfig(env:Readonly<Record<string,string|undefined>>):WebAuthConfig|undefined{
 if(env.VTV_LOCAL_UAT_ENABLED==='1'&&!localUat(env))return undefined;
 if(env.WEB_AUTH_ENABLED!=="1")return undefined;
 if(managedProfileSelected(env)){
  const deployment=readManagedDeployment(env),database=managedDatabase(env,env.WEB_AUTH_DATABASE_URL||env.DATABASE_URL,'vtv_web_runtime'),csrfSecret=env.WEB_AUTH_CSRF_SECRET??'',outboxKey=env.WEB_AUTH_OUTBOX_KEY??'',smtp=readSmtpConfiguration(env),mailApproved=env.WEB_AUTH_EMAIL_DELIVERY_APPROVED==='1';
  if(!deployment||!database||env.WEB_AUTH_ENV!==deployment.profile||env.WEB_AUTH_ORIGIN!==deployment.origin||!/^[a-f0-9]{64}$/.test(csrfSecret)||!/^[a-f0-9]{64}$/.test(outboxKey)||csrfSecret===outboxKey||mailApproved&&!smtp)return undefined;
  return {environment:deployment.profile,origin:deployment.origin,database,installationId:deployment.authInstallationId,csrfSecret,outboxKey,smtp,mailApproved,workerSecret:env.WEB_AUTH_WORKER_SECRET,managed:true};
 }
 try{
  const rawUrl=env.DATABASE_URL||env.WEB_AUTH_DATABASE_URL;if(!rawUrl)return undefined;
  const environment=(env.WEB_AUTH_ENV??"development") as WebAuthConfig["environment"];
  if(!["test","development","staging","production"].includes(environment))return undefined;
  const origin=env.WEB_AUTH_ORIGIN??"http://localhost:3000",url=new URL(rawUrl);
  if(url.protocol!=="postgresql:"||url.search||url.hash)return undefined;
  const user=decodeURIComponent(url.username)||"vetthevat_user",password=decodeURIComponent(url.password);
  const name=decodeURIComponent(url.pathname.slice(1))||env.WEB_AUTH_DATABASE_NAME||"vetthevat_db",port=Number(url.port||5432);
  if(!name||!password||!Number.isInteger(port)||port<1||port>65535)return undefined;
  const local=environment!=="production";
  if(environment==="test"||name==="vtv_web_auth_test"||url.pathname==="/vtv_web_auth_test"){
    if(name==="vtv_saas_dev"&&(env.WEB_AUTH_LOCAL_DATABASE_APPROVED!=="vtv_saas_dev"||env.SAAS_DATABASE_APPROVED!=="vtv_saas_dev"))return undefined;
    if(!origin.startsWith("https://")||new URL(origin).origin!==origin||url.search||url.hash||decodeURIComponent(url.username)!=="vtv_web_runtime"||name!==env.WEB_AUTH_DATABASE_NAME)return undefined;
    const secrets=[env.WEB_AUTH_CSRF_SECRET,env.WEB_AUTH_OUTBOX_KEY];if(secrets.some(s=>!s||!/^[a-f0-9]{64}$/.test(s))||secrets[0]===secrets[1])return undefined;
    if(!/^[a-f0-9-]{36}$/.test(env.WEB_AUTH_INSTALLATION_ID??""))return undefined;
    if(url.hostname!=="127.0.0.1"||environment==="production"||env.VERCEL!==undefined)return undefined;
    const mailApproved=env.WEB_AUTH_EMAIL_DELIVERY_APPROVED==="1";
    const smtp=readSmtpConfiguration(env);if(mailApproved&&!smtp)return undefined;
    return {environment:"test",origin,database:{host:url.hostname,port,name,user:"vtv_web_runtime",password,tls:false},installationId:env.WEB_AUTH_INSTALLATION_ID!,csrfSecret:secrets[0]!,outboxKey:secrets[1]!,mailApproved,smtp,workerSecret:env.WEB_AUTH_WORKER_SECRET};
  }
  const secrets=[env.WEB_AUTH_CSRF_SECRET||'a'.repeat(64),env.WEB_AUTH_OUTBOX_KEY||'b'.repeat(64)];
  const installationId=env.WEB_AUTH_INSTALLATION_ID||"00000000-0000-4000-8000-000000000001";
  const mailApproved=env.WEB_AUTH_EMAIL_DELIVERY_APPROVED==="1";
  const smtp=readSmtpConfiguration(env);
  return {environment,origin,database:{host:url.hostname||"127.0.0.1",port,name,user,password,tls:env.WEB_AUTH_DATABASE_TLS==="verify-full"},installationId,csrfSecret:secrets[0]!,outboxKey:secrets[1]!,mailApproved,smtp,workerSecret:env.WEB_AUTH_WORKER_SECRET};
 }catch{return undefined;}
}

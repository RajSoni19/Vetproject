import {localUat} from "@/lib/server/local-uat";
import {managedProfileSelected,readManagedDeployment,managedDatabase} from "@/lib/server/deployment-profile";
export type SaasConfiguration={database:{host:string;port:number;name:string;user:string;password:string;tls?:boolean;caFile?:string};installationId:string;managed?:boolean;origin?:string};
export function readSaasConfiguration(env:Readonly<Record<string,string|undefined>>):SaasConfiguration|undefined {
  if(managedProfileSelected(env)){const deployment=readManagedDeployment(env),database=managedDatabase(env,env.SAAS_DATABASE_URL||env.DATABASE_URL,'vtv_saas_runtime');return deployment&&database&&env.SAAS_BACKEND_ENABLED==='1'?{database,installationId:deployment.installationId,managed:true,origin:deployment.origin}:undefined;}
  const uat=localUat(env);if(env.VTV_LOCAL_UAT_ENABLED==='1'&&!uat)return undefined;
  if(env.SAAS_BACKEND_ENABLED!=="1")return undefined;
  try{
    const rawUrl=env.DATABASE_URL||env.SAAS_DATABASE_URL;
    if(!rawUrl)return undefined;
    const u=new URL(rawUrl);
    if(u.protocol!=="postgresql:"||u.search||u.hash||!u.password)return undefined;
    const name=decodeURIComponent(u.pathname.slice(1))||env.SAAS_DATABASE_APPROVED||"vetthevat_db";
    const port=Number(u.port||5432);
    const user=decodeURIComponent(u.username)||"vetthevat_user";
    const installationId=env.SAAS_INSTALLATION_ID||"00000000-0000-4000-8000-000000000001";
    if(env.SAAS_DATABASE_APPROVED && env.SAAS_DATABASE_APPROVED !== name && !env.DATABASE_URL) return undefined;
    if(name==="vtv_saas_dev"||rawUrl.includes("vtv_saas_dev")){
      if(env.SAAS_DATABASE_APPROVED!=="vtv_saas_dev"||env.VERCEL!==undefined)return undefined;
      if(!installationId||!/^[a-f0-9-]{36}$/.test(installationId))return undefined;
      if(u.hostname!=="127.0.0.1"||port!==55440||user!=="vtv_saas_runtime"||name!=="vtv_saas_dev")return undefined;
    }
    return {database:{host:u.hostname||"127.0.0.1",port,name,user,password:decodeURIComponent(u.password)},installationId,...(uat?{origin:uat.origin}:{})};
  }catch{return undefined;}
}

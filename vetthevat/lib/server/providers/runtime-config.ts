import {managedProfileSelected,readManagedDeployment,managedDatabase} from "@/lib/server/deployment-profile";
export type ProviderRuntimeConfiguration={database:{host:string;port:number;name:string;user:string;password:string;tls?:boolean;caFile?:string};installationId:string;managed?:boolean};

export function readProviderRuntimeConfiguration(env:Readonly<Record<string,string|undefined>>):ProviderRuntimeConfiguration|undefined{
 if(managedProfileSelected(env)){const deployment=readManagedDeployment(env),database=managedDatabase(env,env.PROVIDER_RUNTIME_DATABASE_URL,'vtv_saas_provider_runtime');return deployment&&database&&env.PROVIDER_RUNTIME_ENABLED==='1'?{database,installationId:deployment.installationId,managed:true}:undefined;}
 if(env.PROVIDER_RUNTIME_ENABLED!=="1"||env.VERCEL!==undefined||env.SAAS_DATABASE_APPROVED!=="vtv_saas_dev")return undefined;
 try{
  const url=new URL(env.PROVIDER_RUNTIME_DATABASE_URL??"");
  if(url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||url.port!=="55440"||url.pathname!=="/vtv_saas_dev"||url.username!=="vtv_saas_provider_runtime"||url.search||url.hash||!url.password)return undefined;
  const installationId=env.SAAS_INSTALLATION_ID??"";
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(installationId))return undefined;
  return {database:{host:"127.0.0.1",port:55440,name:"vtv_saas_dev",user:"vtv_saas_provider_runtime",password:decodeURIComponent(url.password)},installationId};
 }catch{return undefined;}
}

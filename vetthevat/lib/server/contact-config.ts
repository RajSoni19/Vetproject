import {managedProfileSelected,readManagedDeployment,managedDatabase} from "@/lib/server/deployment-profile";
export const contactWorkerSchemaSha256='215e7921244578ec15b8881d752f3d5f3e75bce8b64f19891d2d637f3d823391';
export type ContactConfiguration={database:{host:string;port:number;name:string;user:string;password:string;tls?:boolean;caFile?:string};origin:string;installationId:string;secret:string;siteKey:string;botSecret:string;managed?:boolean};
export function readContactConfiguration(env:Readonly<Record<string,string|undefined>>):ContactConfiguration|undefined{
 if(managedProfileSelected(env)){
  const profile=readManagedDeployment(env),database=managedDatabase(env,env.CONTACT_DATABASE_URL,'vtv_contact_runtime'),secret=env.CONTACT_HASH_SECRET??'',siteKey=env.CONTACT_TURNSTILE_SITE_KEY??'',botSecret=env.CONTACT_TURNSTILE_SECRET_KEY??'';
  if(!profile||!database||env.CONTACT_ENABLED!=='1'||env.CONTACT_RUNTIME_SCHEMA_SHA256!==contactWorkerSchemaSha256||env.CONTACT_ORIGIN!==profile.origin||secret.length<32||/[<>\r\n]/.test(secret)||!/^[A-Za-z0-9_-]{10,100}$/.test(siteKey)||/^[123]x000000/.test(siteKey)||botSecret.length<20||/[<>\r\n]/.test(botSecret))return undefined;
  return {database,origin:profile.origin,installationId:profile.installationId,secret,siteKey,botSecret,managed:true};
 }
 if(env.CONTACT_ENABLED!=='1'||env.CONTACT_SCHEMA_SHA256!=='a8d47899caec449f7ec4be000a043952e8fd1eba73a7bfd2ea7e72d8f7d087a1'||env.SAAS_DATABASE_APPROVED!=='vtv_saas_dev'||env.CONTACT_ORIGIN!=='https://localhost:3444'||env.VERCEL!==undefined)return undefined;
 try{const url=new URL(env.CONTACT_DATABASE_URL??''),installationId=env.SAAS_INSTALLATION_ID??'',secret=env.CONTACT_HASH_SECRET??'',siteKey=env.CONTACT_TURNSTILE_SITE_KEY??'',botSecret=env.CONTACT_TURNSTILE_SECRET_KEY??'';
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='55440'||url.pathname!=='/vtv_saas_dev'||url.username!=='vtv_contact_runtime'||url.search||url.hash||!url.password||/[<>]/.test(url.password)||!/^[a-f0-9-]{36}$/.test(installationId)||secret.length<32||/[<>\r\n]/.test(secret)||!/^[A-Za-z0-9_-]{10,100}$/.test(siteKey)||/^[123]x000000/.test(siteKey)||botSecret.length<20||/[<>\r\n]/.test(botSecret))return undefined;
  return {database:{host:'127.0.0.1',port:55440,name:'vtv_saas_dev',user:'vtv_contact_runtime',password:decodeURIComponent(url.password)},origin:'https://localhost:3444',installationId,secret,siteKey,botSecret};
 }catch{return undefined;}
}

import {managedProfileSelected} from "@/lib/server/deployment-profile";
export type PrivateS3Configuration={endpoint:"http://127.0.0.1:59000";bucket:"vtv-saas-dev-private";region:string;accessKeyId:string;secretAccessKey:string};
// Only a separately approved isolated S3-compatible service is accepted for now.
// Explicit credentials prevent accidental use of the AWS default/production chain.
export function readPrivateS3Configuration(env:Readonly<Record<string,string|undefined>>):PrivateS3Configuration|undefined {
  if(managedProfileSelected(env))return undefined;
  if(env.SAAS_OBJECT_STORAGE_ENABLED!=="1"||env.SAAS_OBJECT_STORAGE_APPROVED!=="vtv-saas-dev-private"||env.VERCEL!==undefined)return undefined;
  if(env.SAAS_OBJECT_ENDPOINT!=="http://127.0.0.1:59000"||env.SAAS_OBJECT_BUCKET!=="vtv-saas-dev-private")return undefined;
  const region=env.SAAS_OBJECT_REGION,accessKeyId=env.SAAS_OBJECT_ACCESS_KEY,secretAccessKey=env.SAAS_OBJECT_SECRET_KEY;
  if(!region||!/^[a-z0-9-]{1,64}$/.test(region)||!accessKeyId||!secretAccessKey||accessKeyId.length<3||secretAccessKey.length<16||/[<>\s]/.test(accessKeyId+secretAccessKey))return undefined;
  return {endpoint:"http://127.0.0.1:59000",bucket:"vtv-saas-dev-private",region,accessKeyId,secretAccessKey};
}

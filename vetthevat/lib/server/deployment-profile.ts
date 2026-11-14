// Managed hosting is a separate explicit branch. A partial/invalid profile must
// never fall back to a local database or relax any accepted development guard.
export type ManagedDeployment={profile:'staging'|'production';provider:'neon'|'serververse';origin:string;host:string;port:number;name:string;installationId:string;authInstallationId:string;caFile:string};
export type LocalDocumentWorker={profile:'local-wsl';host:string;port:55440;name:'vtv_saas_dev';user:'vtv_saas_document_worker';password:string;installationId:string};
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function privateIpv4(value:string){const m=value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);if(!m)return false;const [a,b,c,d]=m.slice(1).map(Number);if([a,b,c,d].some(n=>n>255)||a===0||a===127||a>=224)return value==='127.0.0.1';return a===10||a===192&&b===168||a===172&&b>=16&&b<=31;}
// Explicit local-only document worker configuration. The worker may connect
// only to the approved dev database through loopback or a private WSL host
// address pinned in both the URL and approval selector. Managed profiles and
// hosted runtimes cannot use this branch.
export function readLocalDocumentWorker(env:Readonly<Record<string,string|undefined>>):LocalDocumentWorker|undefined{
 try{if(env.VTV_DOCUMENT_WORKER_PROFILE!=='local-wsl'||env.VTV_DEPLOYMENT_PROFILE!==undefined&&env.VTV_DEPLOYMENT_PROFILE!=='local'||env.VERCEL!==undefined||!['development','test'].includes(env.NODE_ENV??''))return undefined;
  if(env.SAAS_BACKEND_ENABLED!=='1'||env.SAAS_DATABASE_APPROVED!=='vtv_saas_dev'||env.SAAS_INSTALLATION_ID!==env.VTV_LOCAL_WORKER_INSTALLATION_ID||!uuidPattern.test(env.SAAS_INSTALLATION_ID??''))return undefined;
  const approved=env.VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED??'',url=new URL(env.VTV_LOCAL_WORKER_DATABASE_URL??''),host=decodeURIComponent(url.hostname),port=Number(url.port||'5432'),name=decodeURIComponent(url.pathname.slice(1)),user=decodeURIComponent(url.username),password=decodeURIComponent(url.password);
  if(url.protocol!=='postgresql:'||url.search||url.hash||host!==approved||!privateIpv4(host)||port!==55440||name!=='vtv_saas_dev'||user!=='vtv_saas_document_worker'||!password||/[<>\r\n]/.test(password))return undefined;
   return {profile:'local-wsl',host,port:55440,name:'vtv_saas_dev',user:'vtv_saas_document_worker',password,installationId:env.SAAS_INSTALLATION_ID!};
 }catch{return undefined;}
}
export function managedProfileSelected(env:Readonly<Record<string,string|undefined>>){return env.VTV_DEPLOYMENT_PROFILE!==undefined&&env.VTV_DEPLOYMENT_PROFILE!==''&&env.VTV_DEPLOYMENT_PROFILE!=='local';}
export function readManagedDeployment(env:Readonly<Record<string,string|undefined>>):ManagedDeployment|undefined{
 try{const profile=env.VTV_DEPLOYMENT_PROFILE;if(!['staging','production'].includes(profile??'')||env.VERCEL!==undefined)return undefined;
  const provider=env.VTV_DATABASE_PROVIDER,origin=env.VTV_PUBLIC_ORIGIN??'',url=new URL(origin),host=env.VTV_DATABASE_HOST??'',port=Number(env.VTV_DATABASE_PORT??'5432'),name=env.VTV_DATABASE_NAME??'',installationId=env.SAAS_INSTALLATION_ID??'',authInstallationId=env.WEB_AUTH_INSTALLATION_ID??'',caFile=env.VTV_DATABASE_CA_FILE??'';
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const dns=/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
  if(url.origin!==origin||url.protocol!=='https:'||url.port||!dns.test(url.hostname)||/localhost|\.local$|\.test$|\.invalid$/.test(url.hostname)||host!==env.VTV_APPROVED_DATABASE_HOST||!Number.isInteger(port)||port<1||port>65535||[55439,55440].includes(port)||name!==`vtv_saas_${profile}`||env.VTV_APPROVED_DATABASE_NAME!==name||!uuid.test(installationId)||!uuid.test(authInstallationId)||env.VTV_MANAGED_RUNTIME_APPROVED!==`${profile}:${installationId}`||!caFile.startsWith(`/etc/vetthevat/${profile}/`)||!caFile.endsWith('.pem')||caFile.includes('..')||/[<>\s]/.test(caFile))return undefined;
  if(provider==='neon'){
   if(!/^ep-[a-z0-9-]+(?:[.]c-[0-9]+)?[.]eu-west-2[.]aws[.]neon[.]tech$/.test(host)||host.split('.')[0].endsWith('-pooler')||port!==5432||env.VTV_SERVERVERSE_DATABASE_APPROVED!==undefined)return undefined;
  }else if(provider==='serververse'){
   if(profile!=='production'||host!=='127.0.0.1'||port<1024||env.VTV_SERVERVERSE_DATABASE_APPROVED!==`production:${installationId}:${port}`)return undefined;
  }else return undefined;
  return {profile:profile as ManagedDeployment['profile'],provider,origin,host,port,name,installationId,authInstallationId,caFile};
 }catch{return undefined;}
}
export function managedDatabase(env:Readonly<Record<string,string|undefined>>,value:string|undefined,role:string){
 const deployment=readManagedDeployment(env);if(!deployment)return undefined;
 try{const url=new URL(value??''),password=decodeURIComponent(url.password);if(url.protocol!=='postgresql:'||url.hostname!==deployment.host||Number(url.port||5432)!==deployment.port||decodeURIComponent(url.pathname.slice(1))!==deployment.name||decodeURIComponent(url.username)!==role||!password||/[<>\r\n]/.test(password)||url.search||url.hash)return undefined;
  return {host:deployment.host,port:deployment.port,name:deployment.name,user:role,password,tls:true as const,caFile:deployment.caFile};
 }catch{return undefined;}
}

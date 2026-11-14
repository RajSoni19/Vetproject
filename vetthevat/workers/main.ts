import {mkdirSync,writeFileSync,renameSync,readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {runDocumentWorker} from "@/lib/server/saas/document-runtime";
import {readManagedDeployment,readLocalDocumentWorker} from "@/lib/server/deployment-profile";

import {workerLoop} from "@/lib/server/worker-loop";

async function main(){
 const kind=process.argv[2],deployment=readManagedDeployment(process.env),local=readLocalDocumentWorker(process.env),uid=typeof process.getuid==='function'?process.getuid():-1;
 if((!deployment&&!local)||!['mail','contact','stripe','inspect','extract','supplier-logo'].includes(kind)||local&&!['inspect','extract','supplier-logo'].includes(kind)||uid<=0)throw Error('Approved worker configuration and non-root identity required');
 const controller=new AbortController();for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>controller.abort());
 const heartbeat=process.env.VTV_WORKER_HEARTBEAT,expectedHeartbeat=deployment?`/var/lib/vetthevat-${deployment.profile}-${kind}/heartbeat.json`:`/run/user/${uid}/vtv-document-worker/${kind}.json`;if(heartbeat!==expectedHeartbeat||local&&Number(process.env.VTV_LOCAL_WORKER_UID)!==uid)throw Error('Worker heartbeat target mismatch');
 const releaseId=deployment?JSON.parse(readFileSync(resolve(process.cwd(),'../release.json'),'utf8')).id:readFileSync(resolve(process.cwd(),'.next/BUILD_ID'),'utf8').trim();if(typeof releaseId!=='string'||!releaseId)throw Error('Release manifest required');
 let lastState='starting';
 const record=(state:string,log=true)=>{lastState=state;const data=JSON.stringify({kind,state,at:new Date().toISOString(),release:releaseId,pid:process.pid});mkdirSync(dirname(heartbeat),{recursive:true,mode:0o700});writeFileSync(heartbeat+'.tmp',data,{mode:0o600});renameSync(heartbeat+'.tmp',heartbeat);if(log)console.log(JSON.stringify({kind,state,at:new Date().toISOString()}));};
 const operation=kind==='contact'?async(signal:AbortSignal)=>{const {runContactWorker}=await import('@/lib/server/contact-worker-runtime');return runContactWorker(signal);}:kind==='mail'?async()=>{const [{processAuthNotification},{webAuthServices}]=await Promise.all([import('@/lib/server/web-auth/notifications'),import('@/lib/server/web-auth/runtime')]);const auth=webAuthServices();return auth?processAuthNotification(auth):{state:'disabled'};}:kind==='stripe'?async()=>{const {runStripeReconciliation}=await import('@/lib/server/providers/stripe-worker-runtime');return runStripeReconciliation();}:kind==='supplier-logo'?async(signal:AbortSignal)=>{const {runSupplierLogoWorker}=await import('@/lib/server/saas/supplier-logo-worker-runtime');return runSupplierLogoWorker(signal);}: (signal:AbortSignal)=>runDocumentWorker(kind as 'inspect'|'extract',signal);
 const timer=setInterval(()=>record(lastState,false),5000);try{await workerLoop(operation,{signal:controller.signal,delayMs:2000,record});}finally{clearInterval(timer);}
}
if(require.main===module)main().catch(()=>{console.error('Worker startup/operation failed. Configuration and payload details are redacted.');process.exitCode=1;});

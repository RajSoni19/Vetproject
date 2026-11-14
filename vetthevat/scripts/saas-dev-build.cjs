const {spawnSync}=require('node:child_process'),path=require('node:path'),root=path.resolve(__dirname,'..');
const typecheck=spawnSync(process.execPath,[path.join('node_modules','typescript','bin','tsc'),'--noEmit','--incremental','false'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
if(typecheck.status!==0){process.exitCode=typecheck.status??1;process.exit();}
const result=spawnSync(process.execPath,[path.join('node_modules','next','dist','bin','next'),'build'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,VETTHEVAT_BUILD_SINGLE_WORKER:'1',VTV_LOCAL_TYPECHECKED_BUILD:'1',NEXT_PUBLIC_VTV_LOCAL_WORKSPACE:'1',WEB_AUTH_ENABLED:'0',SAAS_BACKEND_ENABLED:'0',SAAS_OBJECT_STORAGE_ENABLED:'0',LEADS_ENABLED:'0',LEADS_EMAIL_DELIVERY_APPROVED:'0',WEB_AUTH_EMAIL_DELIVERY_APPROVED:'0'}});
process.exitCode=result.status??1;

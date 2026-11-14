const {spawnSync}=require('node:child_process');
const {fs,path,directory,root,environment}=require('./saas-dev-common.cjs');
require('@next/env').loadEnvConfig(root);
const localOriginalsRoot=path.resolve(process.env.LOCALAPPDATA||'', 'VetTheVat', 'private-originals');
if(!process.env.LOCALAPPDATA)throw Error('Windows LocalAppData is required for approved local document storage.');
if(process.env.SAAS_LOCAL_ORIGINALS_DIR&&path.resolve(process.env.SAAS_LOCAL_ORIGINALS_DIR).toLowerCase()!==localOriginalsRoot.toLowerCase())throw Error('Configured local document storage differs from the approved LocalAppData directory.');
Object.assign(process.env,environment(),{SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',SAAS_LOCAL_ORIGINALS_DIR:localOriginalsRoot});
if(require('./local-workspace.cjs').stale()){
 console.log('The Next.js build is stale; rebuilding before starting the local SaaS server.');
 const build=spawnSync(process.execPath,['scripts/saas-dev-build.cjs'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
 if(build.status!==0)throw Error('Local SaaS build failed; refusing to start a stale application.');
}
const https=require('node:https'),next=require('next');
const app=next({dev:false,dir:root,hostname:'localhost',port:3444});
app.prepare().then(()=>{const handler=app.getRequestHandler(),build=fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim();const server=https.createServer({key:fs.readFileSync(path.join(directory,'localhost.key')),cert:fs.readFileSync(path.join(directory,'localhost.crt'))},(request,response)=>{response.setHeader('x-vetthevat-local-build',build);if(request.headers.host!=='localhost:3444'){response.writeHead(400);response.end();return;}request.headers['x-forwarded-proto']='https';request.headers['x-forwarded-host']='localhost:3444';request.headers['x-forwarded-for']='127.0.0.1';handler(request,response);});server.listen(3444,'127.0.0.1',()=>console.log('Stage A isolated application at https://localhost:3444'));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}).catch(error=>{console.error('Isolated application startup failed: '+(error.code||error.message||String(error)));if(process.env.VTV_STARTUP_DIAGNOSTICS==='1'&&error.stack)console.error(error.stack);process.exitCode=1;});

// Guarded loopback-only development server for Windows environments where the
// Next CLI worker process cannot spawn. Uses the approved local DB profile and
// never runs migrations or enables external providers by default.
const net=require('node:net'),https=require('node:https'),next=require('next');
const s=require('./saas-dev-common.cjs');
require('@next/env').loadEnvConfig(s.root);
const runtimeEnvironment=s.environment();Object.assign(process.env,runtimeEnvironment,{NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_VTV_LOCAL_WORKSPACE:'1'});
const workspace=require('./local-workspace.cjs');
async function free(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('Local port '+port+' is occupied. No process was stopped.')));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
let activeLocalEmail,stopDocuments;
async function main(){
 const status=await workspace.check();await free(3000);await free(3444);
 await free(8025);activeLocalEmail=await require('./local-smtp-capture.cjs').start();const smtp=activeLocalEmail.smtp;
 Object.assign(process.env,{SMTP_ENABLED:'1',WEB_AUTH_EMAIL_DELIVERY_APPROVED:'1',WEB_AUTH_ENV:'test',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.config.port),SMTP_SECURE:'true',SMTP_USER:smtp.config.user,SMTP_PASSWORD:smtp.config.password,SMTP_FROM_NAME:smtp.config.fromName,SMTP_FROM_EMAIL:smtp.config.fromEmail,SMTP_TLS_CA_FILE:smtp.caFile,SMTP_TLS_SERVERNAME:'localhost',WEB_AUTH_WORKER_SECRET:s.crypto.randomBytes(32).toString('hex')});
 Object.assign(process.env,s.environment(),workspace.featureEnvironment(status));
 const app=next({dev:true,dir:s.root,hostname:'127.0.0.1',port:3444});await app.prepare();
 const handler=app.getRequestHandler(),build='local-development';
 const server=https.createServer({key:s.fs.readFileSync(s.path.join(s.directory,'localhost.key')),cert:s.fs.readFileSync(s.path.join(s.directory,'localhost.crt'))},(request,response)=>{
  response.setHeader('x-vetthevat-local-build',build);
  if(request.headers.host!=='localhost:3444'){response.writeHead(400);response.end();return;}
  request.headers['x-forwarded-proto']='https';request.headers['x-forwarded-host']='localhost:3444';request.headers['x-forwarded-for']='127.0.0.1';handler(request,response);
 });
 const entry=require('./local-entry.cjs').localEntry(build);let stopMailWorker;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3444,'127.0.0.1',resolve);});
 await new Promise((resolve,reject)=>{entry.once('error',reject);entry.listen(3000,'127.0.0.1',resolve);});
 stopDocuments=require('./local-worker-manager.cjs').start();
 if(process.env.WEB_AUTH_EMAIL_DELIVERY_APPROVED==='1')stopMailWorker=require('./local-auth-email-worker.cjs').start();
 console.log('OPEN http://localhost:3000/login → https://localhost:3444/login\nAnalytics: https://localhost:3444/app/analytics\nSupplier comparisons: https://localhost:3444/app/ors/prices\nAccount email delivery: '+(process.env.WEB_AUTH_EMAIL_DELIVERY_APPROVED==='1'?'enabled through configured SMTP':'not configured; SMTP is disabled')+'\nSecure document processing status is available on Upload & OCR. Existing document queues are excluded. Stripe billing is disabled.');
 const stop=()=>{stopDocuments?.();stopMailWorker?.();entry.close();void activeLocalEmail?.close();server.close(()=>process.exit(0));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(async error=>{stopDocuments?.();await activeLocalEmail?.close().catch(()=>{});console.error('Local development startup refused: '+(error.code||error.message));process.exitCode=1;});

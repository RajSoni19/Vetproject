// Local WSL entrypoint for the existing durable inspection/extraction workers.
// No migrations, queue seeding, privilege escalation, or provider fallback.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),uid=typeof process.getuid==='function'?process.getuid():-1;
const supplierLogoClaimFixHash='8444d58c1d9180f8a9e2adafb754f2a78fdd1cdc060047995ea1b5e3ecfa9087';
function assertWsl(){if(process.platform!=='linux'||uid<=0||!fs.readFileSync('/proc/version','utf8').toLowerCase().includes('microsoft'))throw Error('Local document workers run only as a non-root WSL2 Linux user.');}
function supplierLogoActivationApproved(env){return env.SAAS_SUPPLIER_LOGOS_ENABLED==='1'&&env.SAAS_SUPPLIER_LOGO_SCHEMA_SHA256==='54bbced1935fb7332143b03a62c5b03aede91c0c351ac9b13c9538e0823290b4'&&env.SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256===supplierLogoClaimFixHash;}
function approvedEnvironment(source=process.env,userId=uid){
 const env={...source,NODE_ENV:source.NODE_ENV||'development',VTV_DOCUMENT_WORKER_PROFILE:'local-wsl',VTV_DEPLOYMENT_PROFILE:'local',VTV_LOCAL_WORKER_UID:String(userId),DOCUMENT_WORKER_ENABLED:'1',SAAS_LOCAL_ORIGINALS_ENABLED:'1',SAAS_LOCAL_ORIGINALS_APPROVED:'vtv_saas_dev',WEB_AUTH_ENV:'test',WEB_AUTH_ORIGIN:'https://localhost:3444',SAAS_BACKEND_ENABLED:'1',SAAS_DATABASE_APPROVED:'vtv_saas_dev'};
 // The compiled worker independently enforces this configuration as well.
 const raw=source.VTV_LOCAL_WORKER_DATABASE_URL??'',approved=source.VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED??'',installation=source.SAAS_INSTALLATION_ID??'';
 let parsed;try{parsed=new URL(raw);}catch{throw Error('A protected local worker database URL is required.');}
 if(parsed.protocol!=='postgresql:'||parsed.hostname!==approved||Number(parsed.port||'5432')!==55440||decodeURIComponent(parsed.pathname.slice(1))!=='vtv_saas_dev'||decodeURIComponent(parsed.username)!=='vtv_saas_document_worker'||!parsed.password||parsed.search||parsed.hash||installation!==source.VTV_LOCAL_WORKER_INSTALLATION_ID)throw Error('Local worker database target/installation is not approved.');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(installation))throw Error('Local worker installation identity is invalid.');
 const ip=parsed.hostname.split('.').map(Number);if(ip.length!==4||ip.some(n=>!Number.isInteger(n)||n<0||n>255)||!(ip[0]===127&&parsed.hostname==='127.0.0.1'||ip[0]===10||ip[0]===192&&ip[1]===168||ip[0]===172&&ip[1]>=16&&ip[1]<=31))throw Error('Local worker host must be loopback or a pinned private WSL host address.');
 const originals=source.SAAS_LOCAL_ORIGINALS_DIR??'';
 if(!/^\/mnt\/[a-z]\/Users\/[^/]+\/AppData\/Local\/VetTheVat\/private-originals$/i.test(originals))throw Error('Local worker storage must point to the approved mounted Windows LocalAppData directory.');
 Object.assign(env,{VTV_LOCAL_WORKER_DATABASE_URL:raw,VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED:approved,VTV_LOCAL_WORKER_INSTALLATION_ID:installation,SAAS_LOCAL_ORIGINALS_DIR:originals});return env;
}
function childEnv(source,processing=false){
 const names=processing?['NODE_ENV','VTV_DOCUMENT_WORKER_PROFILE','VTV_DEPLOYMENT_PROFILE','VTV_LOCAL_WORKER_UID','DOCUMENT_PROCESSING_SOCKET','CLAMAV_INSPECTION_POLICY','CLAMAV_SOCKET']:['NODE_ENV','VTV_DOCUMENT_WORKER_PROFILE','VTV_DEPLOYMENT_PROFILE','VTV_LOCAL_WORKER_UID','DOCUMENT_PROCESSING_SOCKET','CLAMAV_INSPECTION_POLICY','CLAMAV_SOCKET','DOCUMENT_WORKER_ENABLED','VTV_LOCAL_WORKER_DATABASE_URL','VTV_LOCAL_WORKER_DATABASE_HOST_APPROVED','VTV_LOCAL_WORKER_INSTALLATION_ID','SAAS_INSTALLATION_ID','SAAS_BACKEND_ENABLED','SAAS_DATABASE_APPROVED','SAAS_LOCAL_ORIGINALS_ENABLED','SAAS_LOCAL_ORIGINALS_APPROVED','SAAS_LOCAL_ORIGINALS_DIR','SAAS_SUPPLIER_LOGOS_ENABLED','SAAS_SUPPLIER_LOGO_SCHEMA_SHA256','SAAS_SUPPLIER_LOGO_CLAIM_FIX_SHA256','WEB_AUTH_ENV','WEB_AUTH_ORIGIN','VTV_WORKER_HEARTBEAT'];
 return Object.fromEntries(names.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
}
async function waitForSocket(socket,child,timeout=10000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Local processing service exited before its socket became ready.');if(fs.existsSync(socket)){const stat=fs.lstatSync(socket);if(stat.isSocket()&&stat.uid===uid&&(stat.mode&0o077)===0o060)return; }await new Promise(r=>setTimeout(r,100));}throw Error('Local processing socket did not become ready.');}
function stopChild(child){if(child&&child.exitCode===null)child.kill('SIGTERM');}
async function main(){assertWsl();const args=process.argv.slice(2);if(args.some(arg=>arg!=='--supplier-logo-only'))throw Error('Unsupported local worker option.');const kinds=args.includes('--supplier-logo-only')?['supplier-logo']:['inspect','extract'],env=approvedEnvironment();if(kinds.includes('supplier-logo')&&!supplierLogoActivationApproved(env))throw Error('Supplier-logo worker requires the separately approved claim-function migration activation.');const socket=`/run/user/${uid}/vtv-document-worker/processing.sock`,socketDir=path.dirname(socket),scanner=env.CLAMAV_SOCKET||'/run/clamav/clamd.ctl';
 const stat=fs.lstatSync(scanner);if(!stat.isSocket()||(stat.mode&0o007)!==0)throw Error('ClamAV socket has unsafe permissions; protect it before starting workers.');
 fs.mkdirSync(socketDir,{recursive:true,mode:0o700});const dir=fs.lstatSync(socketDir);if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==uid)throw Error('Unsafe local worker socket directory.');fs.chmodSync(socketDir,0o700);
 env.DOCUMENT_PROCESSING_SOCKET=socket;env.CLAMAV_SOCKET=scanner;env.CLAMAV_INSPECTION_POLICY='vtv-local-bounded-v1';
 const outputs=['main.cjs','processing.cjs'].map(n=>path.join(root,'.release-workers',n));for(const file of outputs)if(!fs.existsSync(file))throw Error('Build workers first with npm run workers:build.');
 const processor=spawn(process.execPath,[outputs[1]],{cwd:root,env:childEnv(env,true),stdio:'inherit'});processor.on('error',()=>{});await waitForSocket(socket,processor);
 const workers=[];for(const kind of kinds){const workerEnv={...env,VTV_WORKER_HEARTBEAT:`/run/user/${uid}/vtv-document-worker/${kind}.json`};const child=spawn(process.execPath,[outputs[0],kind],{cwd:root,env:childEnv(workerEnv),stdio:'inherit'});child.on('error',()=>{});workers.push(child);}
 console.log(JSON.stringify({profile:'local-wsl',database:'vtv_saas_dev:55440',role:'vtv_saas_document_worker',processor:'ready',workers:kinds,credentialsLogged:false,migrationsExecuted:false}));
 const stop=()=>{for(const child of workers)stopChild(child);stopChild(processor);};for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
 const children=[processor,...workers];const exited=children.map(child=>new Promise(resolve=>child.once('exit',resolve)));await Promise.race(exited);stop();await Promise.all(exited);if(!process.exitCode)process.exitCode=children.some(child=>child.exitCode!==0&&child.signalCode!=='SIGTERM')?1:0;
}
if(require.main===module)main().catch(error=>{console.error('Local document workers refused: '+(error.code||error.message||'startup failure'));process.exitCode=1;});
module.exports={assertWsl,approvedEnvironment,childEnv,supplierLogoActivationApproved};

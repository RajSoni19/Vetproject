// Run accepted ORS/banking browser workflows against a storage-disabled isolated server.
const s=require('./saas-services.cjs'),{spawn}=require('node:child_process'),delay=ms=>new Promise(r=>setTimeout(r,ms));
let server;
async function main(){
 const build=s.fs.readFileSync('.next/BUILD_ID','utf8').trim();let ready=false;
 try{const r=await s.application('/api/health/live');if(r.status===200)throw Error('Port 3444 already occupied; stop that acceptance process first.');}catch(e){if(e.message.includes('already occupied'))throw e;}
 s.fs.mkdirSync('.launch-acceptance',{recursive:true});const log=s.fs.openSync('.launch-acceptance/regression-server.log','a',0o600);server=spawn(process.execPath,['scripts/saas-dev-server.cjs'],{windowsHide:true,stdio:['ignore',log,log],env:{...process.env,SAAS_LOCAL_ORIGINALS_ENABLED:'0',SAAS_SUPPORT_ENABLED:'0',SAAS_INVOICE_ROUTING_ENABLED:'0'}});
 for(let i=0;i<120;i++){try{const r=await s.application('/api/health/live');if(r.status===200&&r.headers['x-vetthevat-local-build']===build){ready=true;break;}}catch{}await delay(250);}s.assert.ok(ready,'Isolated server unavailable');
 const passed=[];for(const mode of ['--ors-only','--banking-only']){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/browser-invoices.cjs','--pg-auth-only',mode],{windowsHide:true,stdio:'inherit',env:{...process.env,VTV_BROWSER_SAAS:'1'}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(mode+' browser failed')));});passed.push(mode);}
 s.fs.writeFileSync('.launch-acceptance/release-regressions.json',JSON.stringify({at:new Date().toISOString(),build,passed,providerAcceptance:false},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>server?.kill());

// Existing local profile, no migration or queue consumers. Synthetic API/browser
// tests may use this server without starting/draining document/email workers.
const {spawn}=require('node:child_process'),s=require('./saas-dev-common.cjs');
require('@next/env').loadEnvConfig(s.root);
async function main(){
 const workspace=require('./local-workspace.cjs'),status=await workspace.check();
 const child=spawn(process.execPath,['scripts/saas-dev-server.cjs'],{cwd:s.root,env:{...s.environment(),...workspace.featureEnvironment(status),SMTP_ENABLED:'0',WEB_AUTH_EMAIL_DELIVERY_APPROVED:'0'},stdio:'inherit',windowsHide:true});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 child.once('error',()=>{process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
}
main().catch(error=>{console.error('Local acceptance server refused: '+(error.code||error.message));process.exitCode=1;});

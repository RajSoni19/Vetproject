const fs=require('node:fs');
const states={contact:['idle','accepted','retry_or_review'],mail:['idle','accepted','retry_or_review'],stripe:['idle','ignored','expired','reconciled','retry-or-failed'],inspect:['idle','clean','infected'],extract:['idle','review-required','retry-or-failed']};
function validHeartbeat(value,kind,release,now=Date.now()){
 const at=Date.parse(value?.at);
 return value?.kind===kind&&value.release===release&&states[kind]?.includes(value.state)===true&&Number.isFinite(at)&&at<=now+5000&&now-at<=120000;
}
async function run(){const profile=process.argv[2],release=process.argv[3];if(!['staging','production'].includes(profile)||!release)throw Error();for(let n=0;n<40;n++){try{for(const kind of ['mail','contact','stripe','inspect','extract']){const value=JSON.parse(fs.readFileSync(`/var/lib/vetthevat-${profile}-${kind}/heartbeat.json`,'utf8'));if(!validHeartbeat(value,kind,release))throw Error();}console.log('All independent worker heartbeats are current for this release');return;}catch{}await new Promise(r=>setTimeout(r,2000));}throw Error();}
module.exports={validHeartbeat};
if(require.main===module)run().catch(()=>{console.error('Worker readiness incomplete; no queue was changed by the probe.');process.exitCode=1;});

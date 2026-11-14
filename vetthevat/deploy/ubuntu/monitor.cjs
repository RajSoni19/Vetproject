// Read-only probe; structured status only. Never logs secrets or invoice data.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {validHeartbeat}=require('./worker-smoke.cjs');
function signatureFresh(version,now=Date.now()){
 const match=version.trim().match(/^ClamAV [0-9][A-Za-z0-9.+_-]*\/\d+\/(.{10,100})$/),updated=match?Date.parse(match[1]):NaN;
 return Number.isFinite(updated)&&now-updated>=-300000&&now-updated<=24*3600000;
}
function assess(input,now=Date.now()){
 const issues=[];
 if(input.ready!==true)issues.push('app_or_database_or_storage_unready');
 if(!Number.isFinite(input.diskPercent)||input.diskPercent>=85)issues.push('disk_critical_or_unknown');
 if(!Array.isArray(input.workers)||!input.workers.length||input.workers.some(w=>!validHeartbeat(w.value,w.kind,input.release,now)))issues.push('worker_heartbeat_unhealthy');
 if(!input.backup?.offHostVerified||!Number.isFinite(Date.parse(input.backup.at))||now-Date.parse(input.backup.at)>26*3600000||Date.parse(input.backup.at)>now+300000)issues.push('backup_missing_stale_or_unverified');
 if(!input.restore?.passed||!Number.isFinite(Date.parse(input.restore.at))||now-Date.parse(input.restore.at)>30*86400000||Date.parse(input.restore.at)>now+300000)issues.push('restore_drill_missing_or_stale');
 if(input.scannerReady!==true)issues.push('malware_scanner_unready');
 return {at:new Date(now).toISOString(),event:'vtv_health',healthy:issues.length===0,issues};
}
async function run(){
 const profile=process.argv[2],port=process.env.PORT,secret=process.env.VTV_HEALTH_SECRET;
 if(!['staging','production'].includes(profile)||!/^\d{4,5}$/.test(port??'')||Number(port)<1024||Number(port)>65535||!secret||secret.length<32)throw Error('invalid_monitor_configuration');
 const read=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
 const release=read(`/srv/vetthevat/${profile}/current/release.json`)?.id;
 let ready=false;try{const response=await fetch(`http://127.0.0.1:${port}/api/health/ready`,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(5000)});ready=response.ok&&(await response.json()).ready===true;}catch{}
 const base=`/var/lib/vetthevat-${profile}-backup`,disk=fs.statfsSync(base),diskPercent=100*(1-disk.bavail/disk.blocks);
 const kinds=['mail','inspect','extract']; // Billing/contact are separate launch gates.
 let scannerReady=false;try{const config=['--config-file',`/etc/vetthevat/${profile}/clamd.conf`];scannerReady=execFileSync('/usr/bin/clamdscan',[...config,'--ping','1:2','--no-summary','/dev/null'],{timeout:5000,stdio:'pipe'}).toString().includes('PONG')&&signatureFresh(execFileSync('/usr/bin/clamdscan',[...config,'--version'],{timeout:5000,stdio:'pipe'}).toString());}catch{}
 const result=assess({ready,diskPercent,release,workers:kinds.map(kind=>({kind,value:read(`/var/lib/vetthevat-${profile}-${kind}/heartbeat.json`)})),backup:read(base+'/latest.json'),restore:read(base+'/latest-restore.json'),scannerReady});
 console.log(JSON.stringify(result));if(!result.healthy)process.exitCode=2;
}
module.exports={assess,signatureFresh};if(require.main===module)run().catch(()=>{console.log(JSON.stringify({event:'vtv_health',healthy:false,issues:['monitor_configuration_or_probe_failed']}));process.exitCode=2;});

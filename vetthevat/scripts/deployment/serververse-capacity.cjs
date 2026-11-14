// Offline capacity gate. Supplied headroom must exclude every existing VPS app.
const fs=require('node:fs');
const memoryMiB={web:2048,postgres:1536,clamav:3072,processing:2048,workers:3840,backupAndMonitor:896,operatingHeadroom:1024};
function assess(audit){
 const requiredMiB=Object.values(memoryMiB).reduce((a,b)=>a+b,0),issues=[];
 if(audit?.hostIdentityVerified!==true||audit?.existingApplicationsPreserved!==true)issues.push('Verified host audit and protected-application baseline required.');
 if(audit?.os!=='ubuntu-24.04'||audit?.architecture!=='x64')issues.push('Reviewed Ubuntu 24.04 x64 deployment target not established.');
 if(!Number.isFinite(audit?.availableVtvMemoryMiB)||audit.availableVtvMemoryMiB<requiredMiB)issues.push(`At least ${requiredMiB} MiB of VTV-only memory headroom is required by the current caps; scanning cannot be disabled to fit.`);
 if(!Number.isFinite(audit?.availableVtvVcpu)||audit.availableVtvVcpu<4)issues.push('At least four VTV-available vCPUs or a separately load-tested allocation required.');
 const diskRequiredGiB=Math.max(30,3*(audit?.databaseGiB??0)+2*(audit?.originalsGiB??0)+10);
 if(!Number.isFinite(audit?.availableVtvDiskGiB)||audit.availableVtvDiskGiB<diskRequiredGiB)issues.push(`At least ${diskRequiredGiB} GiB of VTV-only disk headroom required; retention growth must also be budgeted.`);
 for(const name of ['applicationPort','postgresPort'])if(!Number.isInteger(audit?.[name])||audit[name]<1024||audit[name]>65535||[5432,55439,55440].includes(audit[name])||!Array.isArray(audit?.listeningPorts)||audit.listeningPorts.includes(audit[name]))issues.push(`${name} must be independently verified unused.`);
 if(audit?.applicationPort===audit?.postgresPort)issues.push('Application and PostgreSQL ports must differ.');
 if(!audit?.auditedAt||Date.parse(audit.auditedAt)>Date.now()+300000||Date.now()-Date.parse(audit.auditedAt)>86400000||!Number.isFinite(Date.parse(audit.auditedAt)))issues.push('Fresh host audit (under 24 hours) required.');
 return {recommendation:issues.length?'NO-GO':'CAPACITY-REVIEW-PASSED',productionReady:false,requiredMiB,memoryMiB,diskRequiredGiB,issues};
}
module.exports={assess};
if(require.main===module){try{const result=assess(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));console.log(JSON.stringify(result,null,2));process.exitCode=result.issues.length?2:0;}catch{console.error('Explicit sanitized host audit JSON required; no remote inventory was attempted.');process.exitCode=2;}}

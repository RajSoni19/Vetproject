// Read-only local check. Never prints configured secret values or asset contents.
const fs=require('node:fs'),path=require('node:path');
function scan(directory,envFile){
 const values=[];
 if(envFile&&fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(!m||m[1].startsWith('NEXT_PUBLIC_')||!/PASSWORD|SECRET|TOKEN|DATABASE_URL|ACCESS_KEY|OUTBOX_KEY|CSRF_SECRET/.test(m[1]))continue;
  let value=m[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  if(value.length>=16&&!/[<>]/.test(value))values.push(value);
 }
 let count=0;
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Unexpected asset symlink');if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);if(values.some(value=>bytes.includes(Buffer.from(value)))||bytes.includes(Buffer.from('-----BEGIN PRIVATE KEY-----')))throw Error('Private material detected in browser assets');count++;}}}
 walk(directory);return {browserAssetsScanned:count,configuredPrivateValuesChecked:values.length,privateValueMatches:0,scope:'Exact configured sensitive values and private-key marker only; not a general secret audit'};
}
module.exports={scan};if(require.main===module)try{console.log(JSON.stringify(scan(process.argv[2]||'.next/static',process.argv[3]||'.env.local')));}catch{console.error('Browser asset secret check failed; contents redacted.');process.exitCode=1;}

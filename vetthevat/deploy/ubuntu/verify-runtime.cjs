// Read-only, no provider connections, secrets or service actions.
const fs=require('node:fs'),path=require('node:path');
function verify(directory,current={platform:process.platform,architecture:process.arch,node:process.versions.node}){
 const release=JSON.parse(fs.readFileSync(path.join(directory,'release.json'),'utf8'));
 const runtime=JSON.parse(fs.readFileSync(path.join(directory,'deploy/runtime.json'),'utf8'));
 if(current.platform!=='linux'||current.architecture!==runtime.architecture||current.node!==runtime.node||release.platform!==current.platform||release.architecture!==current.architecture||release.node!==current.node)throw Error('Artifact and reviewed Linux runtime differ');
 return {runtimeMatched:true};
}
module.exports={verify};
if(require.main===module)try{console.log(JSON.stringify(verify(process.argv[2])));}catch{console.error('Exact reviewed runtime/artifact verification failed; no service changed.');process.exitCode=1;}

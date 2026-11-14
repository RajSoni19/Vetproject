// Pure file rendering. Never connects, installs, deploys or reads .env.local.
const fs=require('node:fs'),path=require('node:path');
function render(profile,hostname,output,options={}){
 if(!['staging','production'].includes(profile)||!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(hostname)||/localhost/.test(hostname))throw Error('Explicit profile and DNS hostname required');
 const root=path.resolve(__dirname,'../..'),out=path.resolve(output),rel=path.relative(root,out);if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||fs.existsSync(out))throw Error('New output directory within workspace required');fs.mkdirSync(out,{recursive:true});
 const port=options.port??(profile==='staging'?3100:3200),tlsMode=options.tlsMode??'cloudflare-mtls';
 if(!Number.isInteger(port)||port<1024||port>65535||[5432,55439,55440].includes(port)||!['cloudflare-mtls','origin-tls'].includes(tlsMode))throw Error('Approved unused app port and explicit TLS mode required');
 const replacements={'@PROFILE@':profile,'@HOSTNAME@':hostname,'@PORT@':String(port)};
 const apply=(s,extra={})=>{for(const [k,v]of Object.entries({...replacements,...extra}))s=s.split(k).join(v);if(/@[A-Z_]+@/.test(s))throw Error('Unresolved template variable');return s;};
 for(const [source,name]of [['deploy/nginx/site.conf.in','nginx-site.conf'],['deploy/nginx/proxy.conf.in','nginx-proxy.conf'],['deploy/processing/clamd.conf.in','clamd.conf']]){
  let content=apply(fs.readFileSync(path.join(root,source),'utf8'));
  if(name==='nginx-site.conf'&&tlsMode==='origin-tls')content=content.replace(/^.*ssl_client_certificate.*\r?\n/gm,'').replace(/^.*ssl_verify_client on;.*\r?\n/gm,'').replace('# Requires Cloudflare origin certificate AND account/zone Authenticated Origin Pulls.','# Verified origin TLS only; Cloudflare AOP has NOT been assumed. Public DNS remains gated.');
  fs.writeFileSync(path.join(out,name),content);
 }
 for(const kind of ['mail','contact','stripe','inspect','extract'])fs.writeFileSync(path.join(out,`vetthevat-${kind}-${profile}.service`),apply(fs.readFileSync(path.join(root,'deploy/systemd/vetthevat-worker@.service.in'),'utf8'),{'@KIND@':kind,'@PROCESSING_GROUP@':['inspect','extract'].includes(kind)?`SupplementaryGroups=vtv-processing-${profile} vtv-originals-${profile}`:''}));
 fs.writeFileSync(path.join(out,'render-manifest.json'),JSON.stringify({profile,hostname,port,tlsMode,hostAudited:false,deploymentApproved:false,executed:false,credentialsIncluded:false},null,2));return out;
}
module.exports={render};if(require.main===module){try{console.log(render(process.argv[2],process.argv[3],process.argv[4]));}catch(e){console.error(e.message);process.exitCode=1;}}

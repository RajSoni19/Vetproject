// Must run in clean Linux CI. Never builds a Linux release from Windows natives.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function build(id){
 if(process.platform!=='linux')throw Error('Linux release compilation requires Linux CI/isolated VM');
 if(!/^[a-z0-9][a-z0-9.-]{6,79}$/.test(id??''))throw Error('Versioned release ID required');
 if(fs.readdirSync(root).some(n=>n!=='.env.example'&&/^\.env(?:\.|$)/.test(n)))throw Error('Refusing build with private environment files; use a clean export');
 const runtime=JSON.parse(fs.readFileSync(path.join(root,'deploy/runtime.json'),'utf8'));
 if(process.versions.node!==runtime.node||process.arch!==runtime.architecture)throw Error('Reviewed exact Node patch and Linux architecture required');
 const out=path.join(root,'dist',id);if(fs.existsSync(out))throw Error('Release directory already exists');
 const env={...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',VETTHEVAT_BUILD_STANDALONE:'1',VETTHEVAT_BUILD_SINGLE_WORKER:'1',WEB_AUTH_ENABLED:'0',SAAS_BACKEND_ENABLED:'0',LEADS_ENABLED:'0',CONTACT_ENABLED:'0',SMTP_ENABLED:'0',STRIPE_TEST_ENABLED:'0',R2_ENABLED:'0'};
 for(const key of Object.keys(env))if(/PASSWORD|SECRET|TOKEN|DATABASE_URL|ACCESS_KEY|OUTBOX_KEY|CSRF_SECRET/.test(key)&&key!=='GITHUB_TOKEN')delete env[key];delete env.GITHUB_TOKEN;
 execFileSync(process.execPath,['node_modules/next/dist/bin/next','build'],{cwd:root,env,stdio:'inherit'});
 execFileSync(process.execPath,['scripts/build-workers.cjs'],{cwd:root,env,stdio:'inherit'});
 const app=path.join(out,'app');fs.mkdirSync(app,{recursive:true});
 const filter=source=>{const name=path.basename(source);return !(name==='cache'&&path.basename(path.dirname(source))==='.next')&&!/^\.env(?:\.|$)/.test(name)&&!/[.](pem|key|p12|pfx|log)$/.test(name);};
 fs.cpSync(path.join(root,'.next/standalone'),app,{recursive:true,filter});
 fs.cpSync(path.join(root,'.next/static'),path.join(app,'.next/static'),{recursive:true});fs.cpSync(path.join(root,'public'),path.join(app,'public'),{recursive:true});
 fs.cpSync(path.join(root,'.release-workers'),path.join(app,'workers'),{recursive:true});fs.cpSync(path.join(root,'deploy'),path.join(out,'deploy'),{recursive:true,filter:source=>filter(source)&&path.basename(source)!=='__pycache__'&&!source.endsWith('.pyc')});
 // Only explicitly supported external runtime modules are needed by workers.
 for(const name of ['pg','nodemailer','@aws-sdk/client-s3','@node-rs/argon2']){const found=require.resolve(name,{paths:[app]});if(!found.startsWith(app+path.sep))throw Error('Worker dependency missing from standalone: '+name);}
 const release={id,node:process.versions.node,platform:process.platform,architecture:process.arch,lockSha256:hash(path.join(root,'package-lock.json')),schema:'managed-baseline-requires-review',productionReady:false};fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(release,null,2));
 const files={};function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Symlink in artifact requires explicit packaging review');if(entry.isDirectory())walk(file);else files[path.relative(out,file).split(path.sep).join('/')]=hash(file);}}walk(out);fs.writeFileSync(path.join(out,'checksums.json'),JSON.stringify(files,null,2));
 execFileSync('tar',['-czf',path.join(root,'dist',id+'.tar.gz'),'-C',out,'.'],{stdio:'inherit'});fs.writeFileSync(path.join(root,'dist',id+'.tar.gz.sha256'),hash(path.join(root,'dist',id+'.tar.gz'))+'  '+id+'.tar.gz\n');console.log(JSON.stringify({release:id,linuxBuilt:true,deployed:false}));
}
module.exports={build};if(require.main===module)try{build(process.argv[2]);}catch{console.error('Release build refused/failed. Use clean Linux CI and inspect the preceding redacted check.');process.exitCode=1;}

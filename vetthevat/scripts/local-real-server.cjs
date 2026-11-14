// Local development operator launcher. No migration or production connection.
const {spawn,spawnSync}=require('node:child_process'),net=require('node:net');
const s=require('./saas-dev-common.cjs'),{review}=require('./saas-stage-b-review.cjs'),{localEntry}=require('./local-entry.cjs');
async function available(port){await new Promise((resolve,reject)=>{const socket=net.createServer();socket.once('error',()=>reject(Error(`Port ${port} is occupied; no process was stopped.`)));socket.listen(port,'127.0.0.1',()=>socket.close(resolve));});}
async function run(){
 if(process.env.VERCEL!==undefined)throw Error('Local launcher refuses Vercel');
 await available(3000);await available(3444);await review();
 const compiled=spawnSync(process.execPath,[s.path.join(__dirname,'saas-dev-build.cjs')],{cwd:s.root,stdio:'inherit',windowsHide:true});if(compiled.status!==0)throw Error('Fresh local build failed');
 const build=s.fs.readFileSync(s.path.join(s.root,'.next/BUILD_ID'),'utf8').trim();
 let redirect;const child=spawn(process.execPath,[s.path.join(__dirname,'saas-dev-server.cjs')],{cwd:s.root,env:{...process.env,NODE_ENV:'production'},stdio:['ignore','pipe','pipe'],windowsHide:true});let ready=false;
 child.stderr.pipe(process.stderr);child.stdout.on('data',chunk=>{process.stdout.write(chunk);if(!ready&&chunk.toString().includes('Stage A isolated application at')){ready=true;redirect=localEntry(build);redirect.once('error',()=>{child.kill();console.error('Port 3000 became occupied; unrelated process retained.');process.exitCode=1;});redirect.listen(3000,'127.0.0.1',()=>{
  const record={pid:process.pid,httpsPid:child.pid,executable:process.execPath,workingDirectory:s.root,project:s.root,build,nodeEnvironment:'production',identityEnvironment:'test',environment:'isolated test; real PostgreSQL authentication',entry:'http://localhost:3000/login',application:'https://localhost:3444/login',database:'127.0.0.1:55440/vtv_saas_dev',emailEnabled:false,manualInvoiceApisEnabled:true,financialApisEnabled:false,at:new Date().toISOString()};
  s.fs.mkdirSync(s.path.join(s.root,'.local-login'),{recursive:true});s.fs.writeFileSync(s.path.join(s.root,'.local-login/server.json'),JSON.stringify(record,null,2));console.log('LOCAL REAL LOGIN: http://localhost:3000/login -> https://localhost:3444/login');
 });}});
 child.on('error',()=>{console.error('Isolated HTTPS server could not start');process.exitCode=1;redirect?.close();});child.on('exit',code=>{redirect?.close();process.exitCode=code??1;});
 const stop=()=>{redirect?.close();child.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
run().catch(e=>{console.error('Local real server refused: '+e.message);process.exitCode=1;});

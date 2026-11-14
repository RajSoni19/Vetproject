const fs=require('node:fs');
const id=process.argv[2],uid=process.getuid?.();
if(process.platform!=='linux'||!uid||!/^[a-f0-9-]{36}$/.test(id??''))process.exit(1);
const runtime=`/run/user/${uid}`,file=`${runtime}/vtv-uat-${id}.pid`,directory=`${runtime}/vtv-document-worker`,socket=`${directory}/processing.sock`;
function activeProcessors(){return fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name)).filter(name=>{try{const stat=fs.statSync(`/proc/${name}`);return stat.uid===uid&&fs.readFileSync(`/proc/${name}/cmdline`,'utf8').includes('.release-workers/processing.cjs');}catch(error){if(error.code==='ENOENT'||error.code==='EACCES')return false;throw error;}});}
function safeRuntimeDirectory(){const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o077)!==0)throw Error('Unsafe processor socket directory.');}
async function main(){
 let pid;
 try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o077)!==0)throw Error('Unsafe processor pid file.');const value=fs.readFileSync(file,'utf8');if(!/^\d+$/.test(value))throw Error('Invalid processor pid.');pid=Number(value);const command=fs.readFileSync(`/proc/${pid}/cmdline`,'utf8');if(!command.includes('.release-workers/processing.cjs'))throw Error('Processor pid identity mismatch.');process.kill(pid,'SIGTERM');
  const deadline=Date.now()+2000;while(Date.now()<deadline){try{if(!fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').includes('.release-workers/processing.cjs'))break;}catch(error){if(error.code==='ENOENT')break;throw error;}await new Promise(resolve=>setTimeout(resolve,50));}
  if(activeProcessors().some(value=>Number(value)===pid))throw Error('Processor did not stop cleanly.');
 }catch(error){if(error.code!=='ENOENT'&&error.code!=='ESRCH')throw error;}
 safeRuntimeDirectory();
 const others=activeProcessors();if(others.length)throw Error('Another trusted processor is active; refusing socket cleanup.');
 try{const stat=fs.lstatSync(socket);if(!stat.isSocket()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o007)!==0)throw Error('Unsafe processor socket.');fs.unlinkSync(socket);}catch(error){if(error.code!=='ENOENT')throw error;}
 try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o077)!==0)throw Error('Unsafe processor pid file.');fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
}
main().catch(error=>{console.error('Isolated processor stop refused: '+(error.code??error.message));process.exitCode=1;});

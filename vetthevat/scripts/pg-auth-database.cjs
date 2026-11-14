// Lifecycle management for the already approved isolated cluster; never migrates.
const {configuration,fs,path,directory}=require('./pg-auth-common.cjs');
const {execFileSync}=require('node:child_process');
try{
 configuration();const cluster=path.join(directory,'cluster');
 if(fs.realpathSync(cluster).toLowerCase()!==cluster.toLowerCase()||fs.readFileSync(path.join(cluster,'PG_VERSION'),'utf8').trim()!=='17')throw Error('Unexpected cluster path/version');
 const action=process.argv[2];if(!['start','stop','status'].includes(action))throw Error('Use start, stop or status');
 const options=action==='start'?['-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55439 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse','-w','start']:action==='stop'?['-m','fast','-w','stop']:['status'];
 execFileSync('C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe',['-D',cluster,...options],{stdio:'ignore',windowsHide:true});
 console.log('Isolated PostgreSQL '+action+' completed; no migration or production connection.');
}catch{console.error('Isolated database command refused or failed. Check only the approved local cluster.');process.exitCode=1;}

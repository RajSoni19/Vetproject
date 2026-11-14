// Lifecycle only for the approved business cluster. Never initializes/migrates.
const s=require('./saas-dev-common.cjs'),{execFileSync}=require('node:child_process');
const original='-h 127.0.0.1,172.20.240.1 -p 55440 -c ssl=off -c log_statement=none -c log_min_error_statement=panic -c log_error_verbosity=terse';
try{
 s.configuration();const action=process.argv[2],cluster=s.path.join(s.directory,'cluster');
 if(!['start','status','stop'].includes(action))throw Error('Use start, status or stop.');
 if(s.fs.realpathSync(cluster).toLowerCase()!==cluster.toLowerCase()||s.fs.readFileSync(s.path.join(cluster,'PG_VERSION'),'utf8').trim()!=='17')throw Error('Cluster path/version mismatch.');
 const opts=s.fs.readFileSync(s.path.join(cluster,'postmaster.opts'),'utf8');
 const expected=['"-h" "127.0.0.1,172.20.240.1"','"-p" "55440"','"ssl=off"','"log_statement=none"','"log_min_error_statement=panic"','"log_error_verbosity=terse"'];
 const previous=['"-h" "127.0.0.1"','"-p" "55440"','"ssl=off"','"log_statement=none"','"log_min_error_statement=panic"','"log_error_verbosity=terse"'];
 const approvedOptions=expected.every(option=>opts.includes(option));
 const approvedUpgrade=action==='start'&&previous.every(option=>opts.includes(option));
 const bareOptions='C:/Program Files/PostgreSQL/17/bin/postgres.exe "-D" "D:/vetthevat.saas-dev/cluster"';
 const postgres='C:/Program Files/PostgreSQL/17/bin/postgres.exe';
 const configHashes={'postgresql.conf':'bdba0eed1edf09d154946c433c203f0d42d5b8b8c27d7a556ad10ff9a116a7f8','postgresql.auto.conf':'ef0843fce52217a6815d36e76a88f618494c851efc3eb9e1a794fe0d8dccdd81','pg_hba.conf':'199139d6715c8fab3d6bf9a71c52c2ec587210d61efb1f88c22650c5bee3d842'};
 const recoverySettings={data_directory:'D:/vetthevat.saas-dev/cluster',hba_file:'D:/vetthevat.saas-dev/cluster/pg_hba.conf',listen_addresses:'127.0.0.1,172.20.240.1',port:'55440',ssl:'off',log_statement:'none',log_min_error_statement:'error',log_error_verbosity:'default'};
 const recoveryOptions=opts.trim()===bareOptions;
 const recoveryConfig=recoveryOptions&&Object.entries(configHashes).every(([name,hash])=>s.crypto.createHash('sha256').update(s.fs.readFileSync(s.path.join(cluster,name))).digest('hex')===hash)&&Object.entries(recoverySettings).every(([name,value])=>execFileSync(postgres,['-D',cluster,'-C',name],{encoding:'utf8',windowsHide:true}).trim().replace(/\\/g,'/')===value);
 const approvedRecovery=['start','status'].includes(action)&&recoveryConfig;
 if(!approvedOptions&&!approvedUpgrade&&!approvedRecovery)throw Error('Original startup settings changed; inspect before starting.');
 const args=action==='start'?['-l',s.path.join(s.directory,'postgres.log'),'-o',original,'-w','start']:action==='stop'?['-m','fast','-w','stop']:['status'];
 execFileSync('C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe',['-D',cluster,...args],{stdio:'inherit',windowsHide:true});
}catch(error){console.error('Approved business database lifecycle failed: '+error.message);process.exitCode=1;}

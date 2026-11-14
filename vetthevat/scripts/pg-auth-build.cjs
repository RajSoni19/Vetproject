const {root,environment}=require('./pg-auth-common.cjs'),{spawn}=require('node:child_process');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','build'],{cwd:root,stdio:'inherit',windowsHide:true,env:environment()});child.on('exit',code=>process.exitCode=code??1);

const tls=require('node:tls'),fs=require('node:fs'),crypto=require('node:crypto');
const common=require('../../scripts/saas-dev-common.cjs');
exports.localSmtp=async()=>{
 const caFile=common.path.join(common.directory,'localhost.crt'),cert=fs.readFileSync(caFile),user='local-acceptance',password=crypto.randomBytes(24).toString('hex'),messages=[],sockets=new Set();
 const server=tls.createServer({key:fs.readFileSync(common.path.join(common.directory,'localhost.key')),cert},socket=>{
  sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.setEncoding('utf8');socket.write('220 localhost ESMTP\r\n');let pending='',authenticated=false,inData=false,data='',recipient='';
  socket.on('data',chunk=>{pending+=chunk;if(pending.length>200000){socket.destroy();return;}for(;;){const at=pending.indexOf('\r\n');if(at<0)break;const line=pending.slice(0,at);pending=pending.slice(at+2);
   if(inData){if(line==='.') {messages.push({to:recipient,raw:data});inData=false;data='';socket.write('250 accepted\r\n');}else{data+=line.replace(/^\.\./,'.')+'\r\n';if(data.length>200000){socket.destroy();return;}}continue;}
   if(/^EHLO |^HELO /i.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
   else if(line.startsWith('AUTH PLAIN ')){authenticated=Buffer.from(line.slice(11),'base64').toString()===`\0${user}\0${password}`;socket.write(authenticated?'235 authenticated\r\n':'535 rejected\r\n');}
   else if(/^MAIL FROM:/i.test(line))socket.write(authenticated?'250 sender\r\n':'530 authenticate\r\n');
   else if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]??'';socket.write(authenticated&&/^[^@\r\n]+@example\.test$/.test(recipient)?'250 recipient\r\n':'550 synthetic recipients only\r\n');}
   else if(line==='DATA'){if(authenticated&&recipient.endsWith('@example.test')){inData=true;socket.write('354 data\r\n');}else socket.write('550 rejected\r\n');}
   else if(line==='QUIT'){socket.end('221 bye\r\n');}
   else socket.write('250 ok\r\n');
  }});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const smtp=require('../load-source.cjs').loadSource('lib/server/providers/smtp'),config={host:'localhost',port:server.address().port,secure:true,user,password,fromName:'VET THE VAT Local',fromEmail:'noreply@example.test'},options=smtp.smtpTransportOptions(config);
 // Pin the locally generated CA; certificate validation remains enabled.
 const transport=require('nodemailer').createTransport({...options,host:'127.0.0.1',tls:{...options.tls,servername:'localhost',ca:cert}});
 return {messages,config,caFile,mailer:smtp.smtpMailer(config,transport),close:async()=>{transport.close();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
};

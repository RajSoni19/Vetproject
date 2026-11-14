const test=require('node:test'),assert=require('node:assert/strict'),tls=require('node:tls'),fs=require('node:fs');
const {loadSource}=require('./load-source.cjs');
const smtp=loadSource('lib/server/providers/smtp'),nodemailer=require('nodemailer'),common=require('../scripts/saas-dev-common.cjs');

test('Nodemailer completes authenticated implicit-TLS SMTP delivery to a local test server',async()=>{
 const certFile=common.path.join(common.directory,'localhost.crt'),key=fs.readFileSync(common.path.join(common.directory,'localhost.key')),cert=fs.readFileSync(certFile);
 let acceptedMessage='',authenticated=false,recipient='';
 const server=tls.createServer({key,cert},socket=>{
  socket.setEncoding('utf8');socket.write('220 localhost ESMTP VTV local acceptance\r\n');let pending='',inData=false,data='';
  socket.on('data',chunk=>{pending+=chunk;for(;;){const end=pending.indexOf('\r\n');if(end<0)break;const line=pending.slice(0,end);pending=pending.slice(end+2);
   if(inData){if(line==='.') {inData=false;acceptedMessage=data;data='';socket.write('250 2.0.0 accepted\r\n');}else data+=line.replace(/^\.\./,'.')+'\r\n';continue;}
   if(/^EHLO /i.test(line)||/^HELO /i.test(line)){socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 200000\r\n');continue;}
   if(line.startsWith('AUTH PLAIN ')){const decoded=Buffer.from(line.slice(11),'base64').toString();authenticated=decoded.includes('smtp-local-user')&&decoded.includes('smtp-local-password');socket.write(authenticated?'235 2.7.0 authenticated\r\n':'535 5.7.8 authentication failed\r\n');continue;}
   if(line.startsWith('AUTH LOGIN')){socket.write('504 5.5.4 use AUTH PLAIN\r\n');continue;}
   if(/^MAIL FROM:/i.test(line)){socket.write('250 2.1.0 sender accepted\r\n');continue;}
   if(/^RCPT TO:/i.test(line)){recipient=line.match(/<([^>]+)>/)?.[1]??'';socket.write('250 2.1.5 recipient accepted\r\n');continue;}
   if(line==='DATA'){inData=true;socket.write('354 end with <CRLF>.<CRLF>\r\n');continue;}
   if(line==='RSET'){socket.write('250 2.0.0 reset\r\n');continue;}
   if(line==='NOOP'){socket.write('250 2.0.0 ok\r\n');continue;}
   if(line==='QUIT'){socket.write('221 2.0.0 bye\r\n');socket.end();continue;}
   socket.write('250 2.0.0 ok\r\n');
  }});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const port=server.address().port,env={WEB_AUTH_ENV:'test',SMTP_ENABLED:'1',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(port),SMTP_SECURE:'true',SMTP_USER:'smtp-local-user',SMTP_PASSWORD:'smtp-local-password',SMTP_FROM_NAME:'VET THE VAT Local Test',SMTP_FROM_EMAIL:'billing@example.test',SMTP_TLS_CA_FILE:certFile,SMTP_TLS_SERVERNAME:'localhost'},config=smtp.readSmtpConfiguration(env);
  assert.ok(config,'local TLS CA settings are accepted only for loopback test SMTP');const options=smtp.smtpTransportOptions(config);assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.tls.servername,'localhost');assert.deepEqual(options.tls.ca,cert);
  const transport=nodemailer.createTransport({ ...options, connectionTimeout:5000, greetingTimeout:5000, socketTimeout:5000 }),mailer=smtp.smtpMailer(config,transport);
  const sent=await mailer.send({to:'recipient@example.test',subject:'Local SMTP acceptance',text:'SMTP loopback accepted this message.',html:'<p>SMTP loopback accepted this message.</p>',reference:'smtp-local/acceptance_0123456789'});
  assert.equal(sent.accepted,true);assert.equal(sent.delivered,false);assert.equal(authenticated,true);assert.equal(recipient,'recipient@example.test');assert.match(acceptedMessage,/SMTP loopback accepted this message\./);assert.match(acceptedMessage,/X-VTV-Delivery-Reference: smtp-local\/acceptance_0123456789/i);
  transport.close();
 }finally{await new Promise(resolve=>server.close(resolve));}
});

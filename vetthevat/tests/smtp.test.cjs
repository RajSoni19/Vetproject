const test=require('node:test'),assert=require('node:assert/strict');
const {loadSource}=require('./load-source.cjs');
const smtp=loadSource('lib/server/providers/smtp');
const env={SMTP_ENABLED:'1',SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'private-user',SMTP_PASSWORD:'synthetic-private-password',SMTP_FROM_NAME:'VET THE VAT',SMTP_FROM_EMAIL:'billing@example.test'};

test('SMTP remains disabled by default and rejects incomplete, unsafe or malformed settings',()=>{
 assert.equal(smtp.readSmtpConfiguration({}),undefined);assert.ok(smtp.readSmtpConfiguration(env));
 for(const patch of [{SMTP_HOST:'smtp.example.test\r\nMAIL FROM:<attacker@example.test>'},{SMTP_PORT:'0'},{SMTP_SECURE:'maybe'},{SMTP_PASSWORD:'short'},{SMTP_FROM_EMAIL:'no-at-domain'},{SMTP_FROM_NAME:'VTV\nBcc:attacker@example.test'}])assert.equal(smtp.readSmtpConfiguration({...env,...patch}),undefined);
});

test('SMTP Nodemailer transport requires TLS and certificate validation for STARTTLS and implicit TLS',()=>{
 const config=smtp.readSmtpConfiguration(env),options=smtp.smtpTransportOptions(config);assert.equal(options.host,'smtp.example.test');assert.equal(options.requireTLS,true);assert.deepEqual(options.tls,{rejectUnauthorized:true,minVersion:'TLSv1.2'});assert.equal(options.secure,false);
 const implicit=smtp.smtpTransportOptions(smtp.readSmtpConfiguration({...env,SMTP_PORT:'465',SMTP_SECURE:'true'}));assert.equal(implicit.secure,true);assert.equal(implicit.requireTLS,false);assert.equal(implicit.tls.rejectUnauthorized,true);
});

test('Nodemailer mailer uses a stable delivery reference, escaped caller content, and reports SMTP acceptance only',async()=>{
 const config=smtp.readSmtpConfiguration(env),sent=[];const mailer=smtp.smtpMailer(config,{sendMail:async message=>{sent.push(message);return {accepted:[{address:'owner@example.test'}],messageId:message.messageId};}});
 const result=await mailer.send({to:'owner@example.test',subject:'Verify account',text:'Safe plain text',html:'<p>&lt;unsafe&gt;</p>',reference:'auth-notification/reference_123456'});
 assert.deepEqual(result,{accepted:true,messageId:'<auth-notification_reference_123456@example.test>',delivered:false});assert.equal(sent.length,1);assert.equal(sent[0].to,'owner@example.test');assert.equal(sent[0].text,'Safe plain text');assert.equal(sent[0].headers['X-VTV-Delivery-Reference'],'auth-notification/reference_123456');
 await assert.rejects(mailer.send({to:'owner@example.test',subject:'bad\r\nBcc: attacker@example.test',text:'x',html:'x',reference:'auth-notification/reference_123456'}),{status:400});
 await assert.rejects(smtp.smtpMailer(config,{sendMail:async()=>({accepted:[],messageId:'<unknown@example.test>'})}).send({to:'owner@example.test',subject:'Notice',text:'x',html:'x',reference:'auth-notification/reference_123456'}),{status:503});
});

const fs=require('node:fs'),path=require('node:path'),{execFileSync,spawn}=require('node:child_process'),uat=require('./uat-environment.cjs'),{loadSource}=require('../tests/load-source.cjs');
const email='sonivraj53@gmail.com',origin='https://localhost:3445';
function escapeHtml(value){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function privateFileAcl(file){
 const sid=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-[0-9-]+/)?.[0];
 if(!sid)throw Error('Local operator identity unavailable.');
 execFileSync('icacls.exe',[file,'/inheritance:r','/grant:r','*'+sid+':F','/grant:r','*S-1-5-18:F','/grant:r','*S-1-5-32-544:F'],{windowsHide:true,stdio:'pipe'});
 const user=execFileSync('whoami.exe',[],{encoding:'utf8',windowsHide:true}).trim().toLowerCase();
 const acl=execFileSync('icacls.exe',[file],{encoding:'utf8',windowsHide:true}).replace(file,'');
 const principals=[...acl.matchAll(/(?:^|\r?\n)\s*([^:\r\n]+):\([^)]+\)/g)].map(match=>match[1].trim().toLowerCase());
 const allowed=new Set([user,'nt authority\\system','builtin\\administrators']);
 if(!principals.length||principals.some(principal=>!allowed.has(principal)))throw Error('Private mailbox ACL verification failed.');
}
function mailboxHtml(link){
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Private VET THE VAT verification</title><main><h1>Email verification</h1><p>This one-time link is stored in your private local UAT mailbox. Do not copy or share it.</p><p><a rel="noreferrer" referrerpolicy="no-referrer" href="'+escapeHtml(link)+'">Open one-time verification link</a></p><p>After the application opens, confirm verification. The link expires and can be used once.</p></main></html>';
}
async function main(){
 if(process.platform!=='win32')throw Error('This private UAT mailbox is available only on the authorized Windows workstation.');
 const c=uat.load(),environment=uat.environment(c);Object.assign(process.env,environment);
 const isLocalUat=loadSource('lib/server/local-uat').localUat(process.env);
 if(!isLocalUat||c.host!=='127.0.0.1'||c.port!==55440||environment.WEB_AUTH_ORIGIN!==origin||environment.WEB_AUTH_DATABASE_NAME!==c.database||environment.WEB_AUTH_EMAIL_DELIVERY_APPROVED!=='0'||environment.SMTP_ENABLED!=='0')throw Error('Isolated UAT mailbox target refused.');
 const services=loadSource('lib/server/web-auth/runtime').webAuthServices();
 if(!services||services.config.environment==='production'||services.config.origin!==origin||services.config.mailApproved||services.config.database.host!=='127.0.0.1'||services.config.database.port!==55440||services.config.database.name!==c.database)throw Error('Local UAT authentication configuration refused.');
 const account=await services.store.transaction(async sql=>{
  const result=await sql.query("SELECT u.id::text,u.status,u.email_verified_at,ARRAY(SELECT r.name FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=u.id) AS roles FROM web_auth.users u WHERE lower(u.email)=lower($1)",[email]);
  if(result.rowCount!==1)throw Error('The requested UAT account does not exist exactly once.');
  const user=result.rows[0];if(user.status!=='active')throw Error('The requested UAT account is not active.');
  if(user.email_verified_at)throw Error('The requested UAT account is already verified.');
  if(user.roles.includes('software_administrator'))throw Error('Platform administrator accounts are not eligible for this customer workflow.');
  return user;
 });
 const notification=loadSource('lib/server/web-auth/core');
 await notification.requestAccountToken({email},services,'verify_email');
 const notice=await services.store.transaction(async sql=>(await sql.query("SELECT id::text FROM web_auth.notification_outbox WHERE user_id=$1 AND kind='verify_email' AND state='pending' ORDER BY created_at DESC,id DESC LIMIT 1",[account.id])).rows[0]);
 if(!notice)throw Error('The application did not queue a verification message.');
 const file=path.join(c.privateDirectory,'verification-mailbox-'+Date.now()+'.html');
 let created=false;
 const mailer={async send(message){
  if(message.to.toLowerCase()!==email)throw Error('Verification mailbox recipient mismatch.');
  const link=message.text.match(/https:\/\/localhost:3445\/verify-email\?token=[A-Za-z0-9_-]{43}/)?.[0];
  if(!link||new URL(link).origin!==origin||new URL(link).pathname!=='/verify-email')throw Error('Application verification link validation failed.');
  try{
   const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);created=true;privateFileAcl(file);
   fs.writeFileSync(file,mailboxHtml(link),{encoding:'utf8',flag:'w'});
   privateFileAcl(file);
  }catch(error){if(created)try{fs.unlinkSync(file);}catch{}created=false;throw error;}
  return {accepted:true,messageId:`<uat-local-mailbox-${notice.id}@localhost>`};
 }};
 const captureServices={...services,config:{...services.config,mailApproved:true}};
 const result=await loadSource('lib/server/web-auth/notifications').processAuthNotification(captureServices,mailer,notice.id);
 if(result.state!=='accepted')throw Error('The verification notice was not privately captured; inspect UAT notification status.');
 spawn('rundll32.exe',['url.dll,FileProtocolHandler',file],{detached:true,stdio:'ignore',windowsHide:true}).unref();
 console.log('Verification message captured in the ACL-restricted local UAT mailbox and opened in your default browser.');
 console.log('Click “Open one-time verification link”, then confirm verification on the VET THE VAT page. The token was not printed or sent externally.');
 console.log('Private mailbox file: '+file);
}
main().catch(error=>{console.error('UAT verification mailbox failed: '+(error.code||error.message||'verification-error'));process.exitCode=1;});

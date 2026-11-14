// Development-only bridge over the existing synthetic TLS SMTP receiver.
// Mail and one-time links remain in memory and are discarded when the app stops.
const http=require('node:http');
const {localSmtp}=require('../tests/fixtures/local-smtp.cjs');
const port=8025;
function escape(value){return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function decoded(raw){return raw.replace(/=\r\n/g,'').replace(/=([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));}
function messages(captured){return captured.map(message=>{
 const body=decoded(message.raw),subject=body.match(/^Subject:\s*(.*)$/mi)?.[1]?.trim()||'Account message';
 const link=body.match(/https:\/\/localhost:3444\/(?:verify-email|reset-password)\?token=[A-Za-z0-9_-]{43}/)?.[0]||null;
 return {to:message.to,subject,link,receivedAt:message.receivedAt||null};
});}
function mailboxHtml(rows){
 const cards=rows.length?rows.map(row=>`<article><h2>${escape(row.subject)}</h2><p>To: ${escape(row.to)}</p><p>Captured: ${escape(row.receivedAt||'this session')}</p>${row.link?`<p><a href="${escape(row.link)}" target="_blank" rel="noopener noreferrer">Open one-time local account link</a></p>`:'<p>No account link was present.</p>'}</article>`).join(''):'<p>No messages captured in this session. Register with an address ending in <code>@example.test</code>.</p>';
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="referrer" content="no-referrer"><title>Local email capture</title><h1>VET THE VAT local email capture</h1><p>This loopback-only inbox stores messages in memory. Links expire and are one-use. Messages disappear when the local app stops.</p>${cards}</html>`;
}
async function start(){
 const smtp=await localSmtp();
 for(const message of smtp.messages)if(!message.receivedAt)message.receivedAt=new Date().toISOString();
 // Stamp future SMTP accepts without changing message bodies or writing them to disk.
 const originalPush=smtp.messages.push.bind(smtp.messages);smtp.messages.push=(...items)=>originalPush(...items.map(item=>({...item,receivedAt:new Date().toISOString()})));
 const server=http.createServer((req,res)=>{
  res.setHeader('cache-control','no-store, max-age=0');res.setHeader('pragma','no-cache');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  if(req.method!=='GET'){res.writeHead(405,{'allow':'GET'});res.end();return;}
  if(req.url==='/messages.json'){res.writeHead(200,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(messages(smtp.messages)));return;}
  if(req.url!=='/'){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(mailboxHtml(messages(smtp.messages)));
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await smtp.close();throw error;}
 return {smtp,server,port,close:async()=>{await new Promise(resolve=>server.close(resolve));await smtp.close();}};
}
module.exports={start};

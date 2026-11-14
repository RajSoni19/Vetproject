const https=require('node:https'),assert=require('node:assert/strict');
const {Client}=require('pg');
const common=require('../scripts/pg-auth-common.cjs');
const origin='https://localhost:3443';
function application(route,{method='GET',body,cookie,csrf,headers={}}={}){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{const request=https.request(origin+route,{method,ca:common.fs.readFileSync(common.path.join(common.directory,'localhost.crt')),headers:{...(payload?{'content-type':'application/json','content-length':Buffer.byteLength(payload)}:{}),...(method==='GET'?{}:{origin,'sec-fetch-site':'same-origin'}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{}),...headers}},response=>{let raw='';response.setEncoding('utf8');response.on('data',part=>raw+=part);response.on('end',()=>{let body;try{body=JSON.parse(raw);}catch{}resolve({status:response.statusCode,headers:response.headers,body,raw});});});request.on('error',reject);request.end(payload);});
}
async function operator(operation){const db=new Client(common.connection('vtv_test_operator'));await db.connect();try{return await operation(db);}finally{await db.end();}}
async function accountToken(email,kind='verify_email'){
 return operator(async db=>{const row=(await db.query('SELECT o.ciphertext,o.iv,o.tag FROM web_auth.notification_outbox o JOIN web_auth.users u ON u.id=o.user_id WHERE u.email=$1 AND o.kind=$2 ORDER BY o.created_at DESC LIMIT 1',[email,kind])).rows[0];assert.ok(row,'Durable encrypted notification exists');const payload=common.load('lib/server/web-auth/crypto').decryptNotification(row,common.configuration().outboxKey);return new URL(payload.url).searchParams.get('token');});
}
async function provision(label){
 const email=`${label}-${common.crypto.randomUUID()}@example.test`,password=common.crypto.randomBytes(24).toString('base64url');
 const registered=await application('/api/auth/register',{method:'POST',body:{fullName:'Isolated Security Test',email,password}});assert.equal(registered.status,202);
 const userId=await operator(async db=>(await db.query('SELECT id FROM web_auth.users WHERE email=$1',[email])).rows[0].id);
 return {email,password,userId};
}
async function verify(account){assert.equal((await application('/api/auth/verify-email',{method:'POST',body:{token:await accountToken(account.email)}})).status,200);}
async function login(account){const response=await application('/api/auth/session',{method:'POST',body:{email:account.email,password:account.password}});assert.equal(response.status,200,'Real PostgreSQL-backed password login');const cookie=response.headers['set-cookie'][0].split(';')[0];const session=await application('/api/auth/session',{cookie});assert.equal(session.status,200);return {cookie,csrf:session.body.csrfToken,response};}
module.exports={...common,Client,assert,origin,application,operator,accountToken,provision,verify,login};

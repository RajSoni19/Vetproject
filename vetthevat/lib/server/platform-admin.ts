import "server-only";
import {createHash,randomBytes} from "node:crypto";
import {ApiError,jsonBody,objectBody,uuid} from "@/lib/server/api-v1";
import {passwordMatches} from "@/lib/server/web-auth/crypto";
import type {Principal,Sql} from "@/lib/server/web-auth/store";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import {platformCompletionEnabled} from "@/lib/server/platform-completion";

export const platformModules=['overview','users','companies','subscriptions','plans','payments','leads','support','ocr','ors','notifications','reports','team','audit','settings'] as const;
export function platformEnabled(env:Readonly<Record<string,string|undefined>>=process.env){return env.PLATFORM_ADMIN_ENABLED==='1'&&env.PLATFORM_ADMIN_SCHEMA_SHA256===platformSchemaSha256;}
// Kept in sync by the review package generator; never executes a migration.
export const platformSchemaSha256='0c1d019fad98ca9252d9ffa25909de0dbf6740f426c5a9afbb2311ca04a323bc';
export function base32(bytes:Uint8Array){let bits=0,value=0,result='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value>>>(bits-5))&31];bits-=5;}}if(bits)result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value<<(5-bits))&31];return result;}
export async function platformTransaction<T>(s:WebAuthServices,work:(sql:Sql)=>Promise<T>){return s.store.transaction(async sql=>{try{return await work(sql);}catch(e){const code=(e as {code?:string}).code;if(code==='42501')throw new ApiError(403,'FORBIDDEN','Platform permission and recent MFA verification are required.');if(code==='23505')throw new ApiError(409,'CONFLICT','This record changed or the request reference was reused. Refresh and try again.');if(['22023','22P02','22007','22003','23514','23502','23503'].includes(code??''))throw new ApiError(400,'INVALID_REQUEST','The requested change is invalid. Check the form values.');throw e;}});}
function text(value:unknown,max:number,optional=false){if(typeof value!=='string'||value.trim().length>(max)||!optional&&!value.trim()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new ApiError(400,'INVALID_REQUEST','Invalid text field.');return value.trim();}
function choice(value:unknown,values:readonly string[]){if(typeof value!=='string'||!values.includes(value))throw new ApiError(400,'INVALID_REQUEST','Invalid selection.');return value;}
function optionalUuid(value:unknown){return value===null||value===''?null:uuid(value);}
export function platformCommandInput(value:unknown){
 const b=objectBody(value,['module','action','id','version','payload','reason']);
 const module=choice(b.module,platformModules),action=text(b.action,40),id=b.id===null?null:uuid(b.id),version=b.version;
 if(!Number.isSafeInteger(version)||Number(version)<0||Number(version)>999999999)throw new ApiError(400,'INVALID_REQUEST','Invalid record version.');
 const reason=text(b.reason,500);if(reason.length<5)throw new ApiError(400,'INVALID_REQUEST','Explain the reason for this change.');
 let payload:Record<string,unknown>;
 if(['users','companies'].includes(module)&&action==='state'){const p=objectBody(b.payload,['status']);payload={status:choice(p.status,['active','suspended'])};}
 else if(module==='plans'&&['create','update'].includes(action)){
  const p=objectBody(b.payload,['name','currency','price','interval','invoice_limit','ocr_limit','company_limit','seat_limit','ors_enabled']);
  if(typeof p.price!=='string'||!/^\d{1,10}(\.\d{1,2})?$/.test(p.price)||typeof p.ors_enabled!=='boolean'||['invoice_limit','company_limit','seat_limit'].some(k=>!Number.isSafeInteger(p[k])||Number(p[k])<1||Number(p[k])>1000000))throw new ApiError(400,'INVALID_REQUEST','Enter valid prices and positive quotas.');
  const ocr=p.ocr_limit??p.invoice_limit;if(!Number.isSafeInteger(ocr)||Number(ocr)<1||Number(ocr)>1000000)throw new ApiError(400,'INVALID_REQUEST','Enter a positive monthly OCR limit.');
  payload={name:text(p.name,80),currency:choice(p.currency,['GBP','EUR','USD']),price:p.price,interval:choice(p.interval,['month','year']),invoice_limit:p.invoice_limit,ocr_limit:ocr,company_limit:p.company_limit,seat_limit:p.seat_limit,ors_enabled:p.ors_enabled};
 }else if(module==='plans'&&action==='archive'){payload=objectBody(b.payload,[]);}
 else if(module==='leads'&&action==='update'){
  const p=objectBody(b.payload,['stage','assignee_id','notes','remind_at','company_id']);
  if(p.remind_at!==null&&(typeof p.remind_at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(p.remind_at)||!Number.isFinite(Date.parse(p.remind_at))))throw new ApiError(400,'INVALID_REQUEST','Invalid reminder date.');
  payload={stage:choice(p.stage,['new','contacted','qualified','proposal','won','lost']),assignee_id:optionalUuid(p.assignee_id),notes:text(p.notes,5000,true),remind_at:p.remind_at,company_id:optionalUuid(p.company_id)};
 }else if(module==='support'&&action==='assign'){const p=objectBody(b.payload,['priority','assignee_id','escalated']);if(typeof p.escalated!=='boolean')throw new ApiError(400,'INVALID_REQUEST','Invalid escalation.');payload={priority:choice(p.priority,['low','normal','high','urgent']),assignee_id:optionalUuid(p.assignee_id),escalated:p.escalated};}
 else if(module==='support'&&['note','reply'].includes(action)){const p=objectBody(b.payload,['body']);payload={body:text(p.body,5000)};}
 else if(module==='support'&&action==='state'){const p=objectBody(b.payload,['state']);payload={state:choice(p.state,['open','pending','closed'])};}
 else if(module==='notifications'&&action==='create'){const p=objectBody(b.payload,['user_id','title','body']);payload={user_id:uuid(p.user_id),title:text(p.title,200),body:text(p.body,2000)};}
 else if(module==='settings'&&action==='save'){const p=objectBody(b.payload,['key','value']);payload={key:choice(p.key,['support_email','support_hours','billing_notice']),value:text(p.value,2000,true)};}
 else if(module==='team'&&action==='grant'){const p=objectBody(b.payload,['role','active']);if(typeof p.active!=='boolean')throw new ApiError(400,'INVALID_REQUEST','Select grant status.');payload={role:choice(p.role,['Super Admin','Billing Admin','Support Agent','Sales Agent','Read-only Auditor']),active:p.active};}
 else if(module==='subscriptions'&&['assign','schedule'].includes(action)){const p=objectBody(b.payload,['plan_id']);payload={plan_id:uuid(p.plan_id)};}
 else if(module==='subscriptions'&&action==='cancel'){const p=objectBody(b.payload,['at_period_end']);if(typeof p.at_period_end!=='boolean')throw new ApiError(400,'INVALID_REQUEST','Select cancellation timing.');payload={at_period_end:p.at_period_end};}
 else if(module==='subscriptions'&&action==='reconcile'){payload=objectBody(b.payload,[]);}
 else if(module==='subscriptions'&&action==='request_state'){const p=objectBody(b.payload,['state']);payload={state:choice(p.state,['acknowledged','closed'])};}
 else if(module==='payments'&&action==='receipt'){const p=objectBody(b.payload,['amount','currency','external_reference','received_at']);if(typeof p.amount!=='string'||!/^\d{1,10}(\.\d{1,2})?$/.test(p.amount)||Number(p.amount)<=0||typeof p.received_at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(p.received_at)||!Number.isFinite(Date.parse(p.received_at)))throw new ApiError(400,'INVALID_REQUEST','Enter a positive payment amount and valid receipt date.');payload={amount:p.amount,currency:choice(p.currency,['GBP','EUR','USD']),external_reference:text(p.external_reference,200),received_at:p.received_at};}
 else throw new ApiError(400,'INVALID_REQUEST','Unsupported administrative action.');
 if(!id&&!(module==='plans'&&action==='create'||module==='notifications'&&action==='create'||module==='settings'&&action==='save'))throw new ApiError(400,'INVALID_REQUEST','Select a record.');
 return {module,action,id,version,reason,payload};
}
export async function platformRequest(request:Request,s:WebAuthServices,p:Principal){
 if(!platformEnabled())throw new ApiError(503,'UNAVAILABLE','Platform administration awaits reviewed migration approval and explicit activation.');
 if(request.method==='GET'){
  const q=new URL(request.url).searchParams;
  if([...q.keys()].some(k=>!['module','query','after','state','ticket','profile','id','billing','lead','analytics'].includes(k)||q.getAll(k).length!==1))throw new ApiError(400,'INVALID_REQUEST','Invalid administrator filters.');
  if(q.has('analytics')){if(q.size!==1||q.get('analytics')!=='1')throw new ApiError(400,'INVALID_REQUEST','Invalid analytics selection.');if(!platformCompletionEnabled())throw new ApiError(503,'UNAVAILABLE','Extended analytics are not enabled.');return platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.analytics($1) AS result',[p.tokenHash])).rows[0].result);}
  if(q.has('billing')||q.has('lead')){if(q.size!==1)throw new ApiError(400,'INVALID_REQUEST','Invalid detail selection.');const billing=q.has('billing');return platformTransaction(s,async sql=>(await sql.query(billing?'SELECT platform_admin.billing_detail($1,$2) AS result':'SELECT platform_admin.lead_timeline($1,$2) AS result',[p.tokenHash,uuid(q.get(billing?'billing':'lead'))])).rows[0].result);}
  if(q.has('profile')){if(q.size!==2)throw new ApiError(400,'INVALID_REQUEST','Invalid profile selection.');return platformTransaction(s,async sql=>{const kind=choice(q.get('profile'),['users','companies']),id=uuid(q.get('id')),result=(await sql.query('SELECT platform_admin.profile($1,$2,$3) AS result',[p.tokenHash,kind,id])).rows[0].result;if(result&&kind==='users'&&platformCompletionEnabled())return {...result,...(await sql.query('SELECT platform_admin.user_profile_extra($1,$2) AS result',[p.tokenHash,id])).rows[0].result};return result;});}
  if(q.get('module')==='security')return platformTransaction(s,async sql=>({...((await sql.query("SELECT platform_admin.security($1,'status') AS result",[p.tokenHash])).rows[0].result),completionEnabled:platformCompletionEnabled()}));
  if(q.has('ticket')){if(q.size!==1)throw new ApiError(400,'INVALID_REQUEST','Invalid ticket selection.');return platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.ticket($1,$2) AS result',[p.tokenHash,uuid(q.get('ticket'))])).rows[0].result);}
  const module=choice(q.get('module')??'overview',platformModules),query=text(q.get('query')??'',200,true),state=text(q.get('state')??'',80,true),after=q.has('after')?uuid(q.get('after')):null;
  const result=await platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.read($1,$2,$3,$4,$5) AS result',[p.tokenHash,module,query,after,state])).rows[0].result);
  if(Array.isArray(result.records)){const rows=result.records;return {...result,records:rows.slice(0,50),after:rows.length>50?rows[49].id:null};}return result;
 }
 const raw=await jsonBody(request,18000);
 if(request.method==='POST'){
  const b=objectBody(raw,['action','password','code']);
  if(b.action==='enroll'){
   const password=text(b.password,128);
   // Recheck password and session inside the enrollment transaction; never log it.
   return platformTransaction(s,async sql=>{const u=(await sql.query("SELECT u.password_hash FROM web_auth.users u JOIN web_auth.sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' FOR SHARE OF u,s",[p.tokenHash])).rows[0];if(!u||!await passwordMatches(u.password_hash,password))throw new ApiError(403,'FORBIDDEN','Current password verification failed.');const secret=randomBytes(32);await sql.query("SELECT platform_admin.security($1,'enroll',$2)",[p.tokenHash,secret]);const encoded=base32(secret);return {secret:encoded,uri:`otpauth://totp/${encodeURIComponent('VET THE VAT:'+p.userId)}?secret=${encoded}&issuer=VET%20THE%20VAT&algorithm=SHA256&digits=6&period=30`};});
  }
  if(b.action!=='verify'||typeof b.code!=='string'||!/^\d{6}$/.test(b.code))throw new ApiError(400,'INVALID_REQUEST','Enter the six-digit authenticator code.');
  const result=await platformTransaction(s,async sql=>(await sql.query("SELECT platform_admin.security($1,'verify',NULL,$2) AS result",[p.tokenHash,b.code])).rows[0].result);
  if(!result.verified)throw new ApiError(403,'FORBIDDEN','Authenticator code invalid, expired or already used.');return result;
 }
 if(request.method!=='PATCH')throw new ApiError(400,'INVALID_REQUEST','Unsupported method.');
 const b=platformCommandInput(raw),key=request.headers.get('idempotency-key');if(!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,'INVALID_REQUEST','A stable request reference is required.');
 return platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.command($1,$2,$3,$4,$5,$6,$7,$8) AS result',[p.tokenHash,b.module,b.action,b.id,b.version,JSON.stringify(b.payload),createHash('sha256').update(key).digest('hex'),b.reason])).rows[0].result);
}

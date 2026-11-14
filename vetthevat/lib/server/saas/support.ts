import {createHash} from "node:crypto";
import {ApiError,jsonBody,mutationHeaders,objectBody,uuid} from "@/lib/server/api-v1";
import {text} from "@/lib/server/saas/invoice-contracts";
import type {Principal,Sql} from "@/lib/server/web-auth/store";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import {platformEnabled,platformTransaction} from "@/lib/server/platform-admin";
export const supportSchemaSha256='b970d7ed9fb38e0d636ac5925f1716685045c28c51c57c0c3d97bacaec7ef9de';
export const supportEnabled=(env:Readonly<Record<string,string|undefined>>)=>env.SAAS_SUPPORT_ENABLED==='1'&&env.SAAS_SUPPORT_SCHEMA_SHA256===supportSchemaSha256;
export function supportInput(action:unknown,value:unknown){
 if(!['create','reply','state'].includes(String(action)))throw new ApiError(400,'INVALID_REQUEST','Invalid support action.');
 const v=objectBody(value,action==='create'?['subject','category','body']:action==='reply'?['body']:['state']);
 if(action==='state'){if(!['open','pending','closed'].includes(String(v.state)))throw new ApiError(400,'INVALID_REQUEST','Invalid ticket state.');return {state:v.state};}
 const body=text(v.body,5000,true)!;
 if(action==='reply')return {body};
 if(!['Invoices','VAT','Reports','Account','Billing','Other'].includes(String(v.category)))throw new ApiError(400,'INVALID_REQUEST','Select a support category.');
 return {subject:text(v.subject,200,true)!,category:v.category,body};
}
async function transaction<T>(s:WebAuthServices,work:(sql:Sql)=>Promise<T>){return s.store.transaction(async sql=>{try{return await work(sql);}catch(e){const code=(e as {code?:string}).code;if(code==='42501')throw new ApiError(403,'FORBIDDEN','Ticket access denied.');if(code==='23505')throw new ApiError(409,'CONFLICT','This ticket changed or the request reference was already used. Refresh before retrying.');if(code==='22023')throw new ApiError(400,'INVALID_REQUEST','The support operation is invalid for this ticket.');throw e;}});}
export async function supportRequest(request:Request,s:WebAuthServices,p:Principal){
 const url=new URL(request.url),search=url.searchParams;
 if([...search.keys()].some(k=>!['companyId','ticketId','after','before','admin'].includes(k))||[...search.keys()].some(k=>search.getAll(k).length!==1))throw new ApiError(400,'INVALID_REQUEST','Invalid support filters.');
 const admin=search.get('admin')==='1';if(search.has('admin')&&!admin)throw new ApiError(400,'INVALID_REQUEST','Invalid support scope.');
 if(admin||p.roles.includes('software_administrator')){
  if(!platformEnabled())throw new ApiError(503,'UNAVAILABLE','Legacy administrator support access is disabled pending the MFA migration.');
  if(admin)await platformTransaction(s,async sql=>{await sql.query("SELECT platform_admin.read($1,'support')",[p.tokenHash]);});
 }
 // This selector requests an explicit admin scope. The database repeats the
 // live grant check on every command; it is never a browser authorization flag.
 const company=admin?null:uuid(request.headers.get('x-company-id')),ticket=search.has('ticketId')?uuid(search.get('ticketId')):null;
 if(admin&&!p.roles.includes('software_administrator'))throw new ApiError(403,'FORBIDDEN','Administrator permission required.');
 if(request.method==='GET'){
  if(ticket){
   if(search.has('after'))throw new ApiError(400,'INVALID_REQUEST','Invalid ticket cursor.');let before:{at:string;id:string}|null=null;
   if(search.has('before')){try{const raw=search.get('before')!;if(raw.length>256)throw Error();before=JSON.parse(Buffer.from(raw,'base64url').toString());if(!before||typeof before.at!=='string'||!Number.isFinite(Date.parse(before.at)))throw Error();uuid(before.id);}catch{throw new ApiError(400,'INVALID_REQUEST','Invalid message cursor.');}}
   const result=await transaction(s,async sql=>(await sql.query('SELECT support_desk.ticket_detail($1,$2,$3,$4,$5) AS detail',[p.tokenHash,company,ticket,before?.at??null,before?.id??null])).rows[0]?.detail);
   if(!result||!Array.isArray(result.messages))throw Error('Missing support receipt');const messages=result.messages.slice(0,50),last=messages[messages.length-1];return {...result,messages,before:result.messages.length>50?Buffer.from(JSON.stringify({at:last.created_at,id:last.id})).toString('base64url'):null};
  }
  if(search.has('before'))throw new ApiError(400,'INVALID_REQUEST','Invalid list cursor.');
  const items=await transaction(s,async sql=>(await sql.query('SELECT support_desk.list_tickets($1,$2,$3) AS items',[p.tokenHash,company,search.has('after')?uuid(search.get('after')):null])).rows[0]?.items);
  if(!Array.isArray(items))throw Error('Missing support list');return {items:items.slice(0,50),after:items.length>50?items[49].id:null};
 }
 if(request.method!=='POST'||[...search.keys()].some(k=>k!=='admin'))throw new ApiError(400,'INVALID_REQUEST','Invalid support command.');
 const body=objectBody(await jsonBody(request,25000),['action','ticketId','payload']),action=body.action,input=supportInput(action,body.payload),m=mutationHeaders(request.headers),ticketId=body.ticketId===null||body.ticketId===undefined?null:uuid(body.ticketId);
 if((action==='create')!==!ticketId||action==='create'&&admin)throw new ApiError(400,'INVALID_REQUEST','Select a company and a supported ticket action.');
 return transaction(s,async sql=>(await sql.query('SELECT support_desk.command($1,$2,$3,$4,$5::jsonb,$6,$7) AS receipt',[p.tokenHash,company,ticketId,action,JSON.stringify(input),m.version,createHash('sha256').update(m.key).digest('hex')])).rows[0]?.receipt);
}

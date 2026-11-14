import {createHash} from "node:crypto";
import {ApiError,apiV1,jsonBody,objectBody,uuid} from "@/lib/server/api-v1";
import {sessionCookie} from "@/lib/server/private-routing";
import {authorizeCookie,binding} from "@/lib/server/web-auth/core";
import {protectRequest,secretKey} from "@/lib/server/web-auth/crypto";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
import {enforceRequestLimits} from "@/lib/server/request-limits";
import {platformTransaction} from "@/lib/server/platform-admin";
import {platformCompletionEnabled} from "@/lib/server/platform-completion";
import {privateOriginals} from "@/lib/server/saas/storage-runtime";
export const runtime='nodejs';
async function handle(request:Request){let download:Response|undefined;const response=await apiV1(async()=>{
 if(!platformCompletionEnabled())throw new ApiError(503,'UNAVAILABLE','Secure support attachment sharing is currently unavailable.');
 const s=webAuthServices();if(!s)throw new ApiError(503,'UNAVAILABLE','Account services unavailable.');
 const p=await authorizeCookie(sessionCookie(request.headers),s),q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>!['admin','ticketId','attachmentId'].includes(k)||q.getAll(k).length!==1)||q.has('admin')&&q.get('admin')!=='1')throw new ApiError(400,'INVALID_REQUEST','Invalid attachment selection.');
 const company=q.get('admin')==='1'?null:uuid(request.headers.get('x-company-id')),ticket=uuid(q.get('ticketId'));
 await enforceRequestLimits(s.store,[{key:secretKey(s.config.csrfSecret,'support-attachments:'+p.userId),limit:60,windowMs:60000}]);
 if(request.method==='GET')return platformTransaction(s,async sql=>{
  if(!q.has('attachmentId'))return (await sql.query('SELECT support_desk.attachment_list($1,$2,$3) AS result',[p.tokenHash,company,ticket])).rows[0].result;
  const store=privateOriginals();if(!store)throw new ApiError(503,'UNAVAILABLE','Private attachment storage unavailable.');
  const original=(await sql.query('SELECT support_desk.attachment_original($1,$2,$3,$4) AS result',[p.tokenHash,company,ticket,uuid(q.get('attachmentId'))])).rows[0].result;
  const bytes=await store.read(original);if(bytes.length!==Number(original.byteSize)||createHash('sha256').update(bytes).digest('hex')!==original.sha256)throw new ApiError(503,'UNAVAILABLE','Attachment integrity verification failed.');
  download=new Response(Buffer.from(bytes),{headers:{'content-type':original.mime,'content-disposition':'attachment; filename="redacted-support-screenshot.'+(original.mime==='image/png'?'png':original.mime==='image/webp'?'webp':'jpg')+'"','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});return null;
 });
 protectRequest(request,s.config.origin,binding(s,p),s.config.csrfSecret);
 if(company===null||q.has('attachmentId'))throw new ApiError(400,'INVALID_REQUEST','Select your company ticket.');
 const b=objectBody(await jsonBody(request,2000),['documentId','description','consent']);if(typeof b.description!=='string'||b.description.trim().length<5||b.description.length>300||b.consent!==true)throw new ApiError(400,'INVALID_REQUEST','Confirm sharing a redacted screenshot and describe it.');
 const description=b.description.trim(),documentId=uuid(b.documentId);
 return platformTransaction(s,async sql=>(await sql.query('SELECT support_desk.attach($1,$2,$3,$4,$5,$6) AS result',[p.tokenHash,company,ticket,documentId,description,true])).rows[0].result);
 });return download&&response.ok?download:response;}
export const GET=handle;export const POST=handle;

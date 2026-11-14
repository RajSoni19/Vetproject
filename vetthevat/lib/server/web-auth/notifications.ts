import { randomUUID,timingSafeEqual } from "node:crypto";
import { decryptNotification } from "@/lib/server/web-auth/crypto";
import {smtpMailer,type SmtpMessage} from "@/lib/server/providers/smtp";
import type { WebAuthServices } from "@/lib/server/web-auth/runtime";
import {ApiError,uuid} from "@/lib/server/api-v1";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export async function processAuthNotification(s:WebAuthServices,mailer=s.config.smtp?smtpMailer(s.config.smtp):undefined,jobId?:string){
 if(!s.config.mailApproved||!mailer)return {state:"disabled"};
 if(jobId)uuid(jobId);
 const lease=randomUUID(),job=await s.store.transaction(async sql=>{
  const row=(await sql.query("SELECT id,user_id,kind,ciphertext,iv,tag,created_at FROM web_auth.notification_outbox WHERE state='pending' AND available_at<=now() AND (lease_until IS NULL OR lease_until<=now()) AND ($1::uuid IS NULL OR id=$1) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",[jobId??null])).rows[0];
  if(!row)return null;
  if(Date.now()-new Date(row.created_at).getTime()>(row.kind==="reset_password"?3600000:22*3600000)){await sql.query("UPDATE web_auth.notification_outbox SET state='review' WHERE id=$1",[row.id]);return null;}
  await sql.query("UPDATE web_auth.notification_outbox SET lease_id=$1,lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$2",[lease,row.id]);return row;
 });if(!job)return {state:"idle"};
 let messageId:string;
 try{
  const payload=decryptNotification(job as {ciphertext:string;iv:string;tag:string},s.config.outboxKey);
  if(typeof payload.to!=="string"||typeof payload.name!=="string"||typeof payload.url!=="string"||new URL(payload.url).origin!==s.config.origin)throw Error();
  const subject=job.kind==="reset_password"?"Reset your VET THE VAT password":job.kind==="team_invitation"?"Accept your VET THE VAT team invitation":"Your VET THE VAT account was created: verify your email";
  const result=await mailer.send({to:payload.to,subject,text:`${payload.name},\n\n${subject}: ${payload.url}\n\nIf you did not request this, ignore this email.`,html:`<p>${escape(payload.name)},</p><p><a href="${escape(payload.url)}">${escape(subject)}</a></p><p>If you did not request this, ignore this email.</p>`,reference:`web-auth/${job.id}`} as SmtpMessage);
  if(result.accepted!==true||typeof result.messageId!=='string'||!result.messageId)throw Error('Missing SMTP acceptance');messageId=result.messageId;
 }catch{
  await s.store.transaction(sql=>sql.query("UPDATE web_auth.notification_outbox SET state=CASE WHEN attempts>=8 THEN 'review' ELSE 'pending' END,available_at=now()+least(3600,30*power(2,attempts)) * interval '1 second',lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 AND state='pending'",[job.id,lease]));return {state:"retry_or_review"};
 }
 // An uncertain acknowledgement must not be treated as a failed SMTP send or
 // immediately scheduled again. Preserve the lease for operator reconciliation.
 const committed=await s.store.transaction(sql=>sql.query("UPDATE web_auth.notification_outbox SET state='accepted',provider_id=$1,lease_id=NULL,lease_until=NULL WHERE id=$2 AND lease_id=$3 AND state='pending' AND lease_until>now()",[messageId,job.id,lease]));
 if(committed.rowCount!==1)throw new ApiError(409,'CONFLICT','Notification lease expired; inspect SMTP acceptance before retrying.');
 return {state:"accepted"};
}
export async function authNotificationHandler(request:Request,s:WebAuthServices|undefined){
 const headers={"cache-control":"no-store"};if(request.method!=="POST")return new Response(null,{status:405,headers:{...headers,Allow:"POST"}});
 const expected=s?.config.workerSecret,supplied=request.headers.get("authorization")??"";
 if(!expected||expected.length<32||!s?.config.mailApproved)return Response.json({error:"Notification delivery is disabled."},{status:503,headers});
 const token=supplied.startsWith("Bearer ")?supplied.slice(7):"";
 const suppliedBytes=Buffer.from(token),expectedBytes=Buffer.from(expected);
 if(suppliedBytes.length!==expectedBytes.length||!timingSafeEqual(suppliedBytes,expectedBytes))return Response.json({error:"Unauthorized."},{status:401,headers});
 try{return Response.json(await processAuthNotification(s),{headers});}catch{return Response.json({error:"Notification delivery unavailable."},{status:503,headers});}
}

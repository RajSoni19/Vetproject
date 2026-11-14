import {createHash} from "node:crypto";
import {ApiError,jsonBody,objectBody,uuid} from "@/lib/server/api-v1";
import {platformEnabled,platformTransaction} from "@/lib/server/platform-admin";
import type {Principal} from "@/lib/server/web-auth/store";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
export async function platformCustomerRequest(request:Request,s:WebAuthServices,p:Principal){
 if(!platformEnabled())throw new ApiError(503,'UNAVAILABLE','Account billing enhancements await reviewed schema approval.');
 if(request.method==='GET'){
  const q=new URL(request.url).searchParams;
  if([...q.keys()].some(k=>!['accountId','notifications'].includes(k)||q.getAll(k).length!==1)||q.has('accountId')&&q.has('notifications'))throw new ApiError(400,'INVALID_REQUEST','Invalid account selection.');
  const notifications=q.get('notifications')==='1';if(q.has('notifications')&&!notifications)throw new ApiError(400,'INVALID_REQUEST','Invalid notification filter.');
  return platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.customer($1,$2,$3) AS result',[p.tokenHash,notifications?null:uuid(q.get('accountId')),notifications?'notifications':'context'])).rows[0].result);
 }
 const b=objectBody(await jsonBody(request,5000),['action','accountId','planId','message','id']);
 if(b.action==='mark_read')return platformTransaction(s,async sql=>(await sql.query("SELECT platform_admin.customer($1,NULL,'mark_read',$2) AS result",[p.tokenHash,JSON.stringify({id:uuid(b.id)})])).rows[0].result);
 if(!['change_plan','cancel'].includes(String(b.action))||typeof b.message!=='string'||b.message.trim().length<5||b.message.length>2000)throw new ApiError(400,'INVALID_REQUEST','Enter a valid request and explanation.');
 const account=uuid(b.accountId),key=request.headers.get('idempotency-key');if(!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,'INVALID_REQUEST','A stable request reference is required.');
 const payload={message:b.message.trim(),...(b.action==='change_plan'?{plan_id:uuid(b.planId)}:{})};
 return platformTransaction(s,async sql=>(await sql.query('SELECT platform_admin.customer($1,$2,$3,$4,$5) AS result',[p.tokenHash,account,b.action,JSON.stringify(payload),createHash('sha256').update(key).digest('hex')])).rows[0].result);
}

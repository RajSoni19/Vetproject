import {ApiError,jsonBody,objectBody,uuid} from "@/lib/server/api-v1";
import {emailInput} from "@/lib/server/web-auth/core";
import {enforceRequestLimits} from "@/lib/server/request-limits";
import {secretKey,tokenHash,validToken,encryptNotification} from "@/lib/server/web-auth/crypto";
import {readSaasConfiguration} from "@/lib/server/saas/config";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import type {Principal,Sql} from "@/lib/server/web-auth/store";
export const teamSchemaSha256="cd1965951a53fb1e3454e8a2798bfc45728e236ec41245ec7f78e167f59914f1";
export function teamEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_TEAM_ENABLED==='1'&&env.SAAS_TEAM_SCHEMA_SHA256===teamSchemaSha256&&Boolean(readSaasConfiguration(env));}
const roles=['Admin','Finance','Accountant','Procurement','Inventory','Staff','Viewer'];
function role(value:unknown){if(typeof value!=='string'||!roles.includes(value))throw new ApiError(400,'INVALID_REQUEST','Select an allowed team role.');return value;}
async function transaction<T>(s:WebAuthServices,work:(sql:Sql)=>Promise<T>){return s.store.transaction(async sql=>{try{return await work(sql);}catch(e){const code=(e as {code?:string}).code;if(code==='42501')throw new ApiError(403,'FORBIDDEN','This identity cannot manage this team or accept this invitation.');if(code==='23505')throw new ApiError(409,'CONFLICT','The invitation or membership already exists, or the shared seat allowance is full. Refresh the team before retrying.');throw e;}});}
export async function teamRequest(request:Request,s:WebAuthServices,p:Principal){
 if(request.method==='GET'){const search=new URL(request.url).searchParams;if(search.getAll('companyId').length!==1||[...search.keys()].some(k=>k!=='companyId'))throw new ApiError(400,'INVALID_REQUEST','Select one company.');return transaction(s,async sql=>(await sql.query('SELECT saas.team_snapshot($1,$2) AS team',[p.tokenHash,uuid(search.get('companyId'))])).rows[0].team);}
 await enforceRequestLimits(s.store,[{key:secretKey(s.config.csrfSecret,`team:user:${p.userId}`),limit:60,windowMs:900000},{key:secretKey(s.config.csrfSecret,'team:global'),limit:300,windowMs:900000}]);
 const body=await jsonBody(request,4000);if(!body||typeof body!=='object'||!('action' in body))throw new ApiError(400,'INVALID_REQUEST','Select a team operation.');
 if(body.action==='invite'){
  const value=objectBody(body,['action','companyId','email','role']),companyId=uuid(value.companyId),email=emailInput(value.email),selectedRole=role(value.role),key=request.headers.get('idempotency-key');
  if(!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,'INVALID_REQUEST','A request reference is required.');
  // A retry derives the same private token, avoiding duplicate invitation/outbox
  // rows even after a lost response. The token is never returned to the browser.
  const token=Buffer.from(secretKey(s.config.outboxKey,`team:${p.userId}:${companyId}:${key}`),'hex').toString('base64url');
  return transaction(s,async sql=>{const result=(await sql.query('SELECT saas.invite_team($1,$2,$3,$4,$5) AS invitation',[p.tokenHash,companyId,email,selectedRole,tokenHash(token)])).rows[0].invitation;
   if(result.created){const encrypted=encryptNotification({to:email,name:String(result.name),url:s.config.origin+'/team-invitation?invitation='+token},s.config.outboxKey);await sql.query("INSERT INTO web_auth.notification_outbox(user_id,kind,ciphertext,iv,tag) VALUES($1,'team_invitation',$2,$3,$4)",[p.userId,encrypted.ciphertext,encrypted.iv,encrypted.tag]);}
   return {invitationId:result.id,queued:true,deliveryConfirmed:false};});
 }
 if(body.action==='accept'){const value=objectBody(body,['action','token']);if(!validToken(value.token))throw new ApiError(400,'INVALID_REQUEST','Invalid invitation link.');return transaction(s,async sql=>(await sql.query('SELECT saas.accept_team($1,$2) AS result',[p.tokenHash,tokenHash(value.token as string)])).rows[0].result);}
 if(body.action==='revoke'){const value=objectBody(body,['action','companyId','invitationId']);return transaction(s,async sql=>{await sql.query('SELECT saas.revoke_team_invitation($1,$2,$3)',[p.tokenHash,uuid(value.companyId),uuid(value.invitationId)]);return {revoked:true};});}
 if(body.action==='change'){const value=objectBody(body,['action','companyId','userId','role','status']);if(!['active','suspended'].includes(String(value.status)))throw new ApiError(400,'INVALID_REQUEST','Select a valid membership status.');return transaction(s,async sql=>{await sql.query('SELECT saas.change_team_member($1,$2,$3,$4,$5)',[p.tokenHash,uuid(value.companyId),uuid(value.userId),role(value.role),value.status]);return {changed:true};});}
 throw new ApiError(400,'INVALID_REQUEST','Unknown team operation.');
}

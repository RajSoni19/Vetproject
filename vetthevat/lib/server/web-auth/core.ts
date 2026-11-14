import { ApiError, objectBody, uuid } from "@/lib/server/api-v1";
import { enforceRequestLimits } from "@/lib/server/request-limits";
import { passwordInput,passwordHash,passwordMatches,dummyPasswordHash,opaqueToken,tokenHash,validToken,secretKey,sessionBinding,encryptNotification } from "@/lib/server/web-auth/crypto";
import type { WebAuthServices } from "@/lib/server/web-auth/runtime";
import { processAuthNotification } from "@/lib/server/web-auth/notifications";
import type { Principal,Sql } from "@/lib/server/web-auth/store";
export function configured(services:WebAuthServices|undefined):WebAuthServices{if(!services)throw new ApiError(503,"UNAVAILABLE","Web authentication is not configured.");return services;}
export function emailInput(value:unknown){if(typeof value!=="string")throw new ApiError(400,"INVALID_REQUEST","Enter a valid email address.");const email=value.normalize("NFKC").trim().toLowerCase();if(email.length>254||! /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))throw new ApiError(400,"INVALID_REQUEST","Enter a valid email address.");return email;}
export function nameInput(value:unknown,max=120){if(typeof value!=="string")throw new ApiError(400,"INVALID_REQUEST","Enter a name.");const name=value.normalize("NFKC").trim().replace(/\s+/g," ");if(!name||name.length>max||/[\u0000-\u001f\u007f]/.test(name))throw new ApiError(400,"INVALID_REQUEST","Enter a valid name.");return name;}
export async function throttle(s:WebAuthServices,action:string,account?:string){await enforceRequestLimits(s.store,[{key:secretKey(s.config.csrfSecret,`global:${action}`),limit:30,windowMs:900000},...(account?[{key:secretKey(s.config.csrfSecret,`account:${action}:${account}`),limit:5,windowMs:900000}]:[])]);}
const principalCache = new Map<string, { principal: Principal; expires: number }>();
export function clearPrincipalCache(hash?: string) { if (hash) principalCache.delete(hash); else principalCache.clear(); }
export async function authorizeCookie(cookie:string,services:WebAuthServices|undefined):Promise<Principal>{
  if(!validToken(cookie))throw new ApiError(401,"UNAUTHENTICATED","Sign in required.");
  const s = configured(services);
  const hash = tokenHash(cookie);
  const now = Date.now();
  const cached = principalCache.get(hash);
  if (cached && cached.expires > now) return cached.principal;
  const principal = await s.store.principal(hash);
  principalCache.set(hash, { principal, expires: now + 15000 });
  return principal;
}
export function administrator(principal:Principal){if(!principal.roles.includes("software_administrator"))throw new ApiError(403,"FORBIDDEN","Administrator access required.");return principal;}
export function binding(s:WebAuthServices,p:Principal){return sessionBinding(s.config.csrfSecret,p.sessionId,p.tokenHash);}
async function tokenNotification(s:WebAuthServices,sql:Sql,user:{id:string;email:string;full_name:string},kind:"verify_email"|"reset_password"){
 const token=opaqueToken(),table=kind==="verify_email"?"email_verification_tokens":"password_reset_tokens",duration=kind==="verify_email"?24:1;
 await sql.query(`UPDATE web_auth.${table} SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[user.id]);
 await sql.query(`INSERT INTO web_auth.${table}(user_id,token_hash,expires_at) VALUES($1,$2,now()+($3::int*interval '1 hour'))`,[user.id,tokenHash(token),duration]);
 await sql.query("UPDATE web_auth.notification_outbox SET state='review' WHERE user_id=$1 AND kind=$2 AND state='pending'",[user.id,kind]);
 const payload=encryptNotification({to:user.email,name:user.full_name,url:`${s.config.origin}/${kind==="verify_email"?"verify-email":"reset-password"}?token=${token}`},s.config.outboxKey);
 const queued=(await sql.query("INSERT INTO web_auth.notification_outbox(user_id,kind,ciphertext,iv,tag) VALUES($1,$2,$3,$4,$5) RETURNING id",[user.id,kind,payload.ciphertext,payload.iv,payload.tag])).rows[0];
 return queued?.id as string|undefined;
}
export async function registerAccount(body:unknown,s:WebAuthServices){
 const value=objectBody(body,["fullName","email","password"]),email=emailInput(value.email),name=nameInput(value.fullName),password=passwordInput(value.password);
 await throttle(s,"register",email);const hash=await passwordHash(password);let notificationId:string|undefined;
 const autoVerify=s.config.environment==='development'&&(!s.config.mailApproved||!s.config.smtp);
 await s.store.transaction(async sql=>{
  const queryText=autoVerify
    ?"INSERT INTO web_auth.users(full_name,email,password_hash,email_verified_at) VALUES($1,$2,$3,now()) ON CONFLICT(email) DO NOTHING RETURNING id,email,full_name"
    :"INSERT INTO web_auth.users(full_name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id,email,full_name";
  const user=(await sql.query(queryText,[name,email,hash])).rows[0];
  if(user){
    if(!autoVerify)notificationId=await tokenNotification(s,sql,user as {id:string;email:string;full_name:string},"verify_email");
    await s.store.audit(sql,user.id,"auth.register");
  }
 });
 if(notificationId&&s.config.mailApproved&&s.config.smtp){try{await processAuthNotification(s,undefined,notificationId);}catch{/* Keep registration committed; the durable outbox can retry. */}}
 return {accepted:true,message:autoVerify?"Account created successfully! You can now sign in with your email and password.":s.config.mailApproved&&s.config.smtp?"If the account can be created, verification instructions will be sent to that address.":"If the account can be created, the request is saved. Email delivery is not configured yet, and sign-in requires email verification."};
}
export async function loginAccount(body:unknown,s:WebAuthServices){
 const value=objectBody(body,["email","password"]),email=emailInput(value.email);if(typeof value.password!=="string"||value.password.length>128||!value.password)throw new ApiError(401,"UNAUTHENTICATED","Unable to sign in with these credentials.");
 await throttle(s,"login",email);const user=await s.store.findUser(email),hash=user?.password_hash??await dummyPasswordHash(),matches=await passwordMatches(hash,value.password);
 const autoVerify=s.config.environment==='development'&&(!s.config.mailApproved||!s.config.smtp);
 if(!matches||!user||user.status!=="active"||(!user.email_verified_at&&!autoVerify)){await s.store.transaction(sql=>s.store.audit(sql,null,"auth.login.failed"));throw new ApiError(401,"UNAUTHENTICATED","Unable to sign in with these credentials.");}
 if(!user.email_verified_at&&autoVerify){
  await s.store.transaction(sql=>sql.query("UPDATE web_auth.users SET email_verified_at=now() WHERE id=$1",[user.id]));
 }
 const token=opaqueToken(),session=await s.store.createSession(user.id,tokenHash(token),user.password_hash);return {token,session};
}
export async function requestAccountToken(body:unknown,s:WebAuthServices,kind:"verify_email"|"reset_password"){
 const value=objectBody(body,["email"]),email=emailInput(value.email);await throttle(s,kind,email);let notificationId:string|undefined;
 await s.store.transaction(async sql=>{const user=(await sql.query("SELECT id,email,full_name,email_verified_at FROM web_auth.users WHERE email=$1 AND status='active' FOR UPDATE",[email])).rows[0];if(user&&(kind==="reset_password"||!user.email_verified_at)){notificationId=await tokenNotification(s,sql,user as {id:string;email:string;full_name:string},kind);await s.store.audit(sql,user.id,`auth.${kind}.requested`);}});
 if(notificationId&&s.config.mailApproved&&s.config.smtp){try{await processAuthNotification(s,undefined,notificationId);}catch{/* Keep the generic response; the durable outbox can retry. */}}
 return {accepted:true,message:"If the address is eligible, instructions will be sent shortly."};
}
export async function consumeAccountToken(body:unknown,s:WebAuthServices,kind:"verify_email"|"reset_password"){
 const value=objectBody(body,kind==="verify_email"?["token"]:["token","password"]);await throttle(s,"consume:"+kind);
 if(!validToken(value.token))throw new ApiError(400,"INVALID_REQUEST","This link is invalid or expired.");
 const password=kind==="reset_password"?await passwordHash(passwordInput(value.password)):undefined,table=kind==="verify_email"?"email_verification_tokens":"password_reset_tokens";
 await s.store.transaction(async sql=>{
  // Lock the user before the token: consistent with issuing new tokens. This
  // serializes reset, password login and token consumption without deadlocks.
  const candidate=(await sql.query(`SELECT user_id FROM web_auth.${table} WHERE token_hash=$1`,[tokenHash(value.token as string)])).rows[0];
  if(!candidate)throw new ApiError(400,"INVALID_REQUEST","This link is invalid or expired.");
  const user=(await sql.query("SELECT id FROM web_auth.users WHERE id=$1 AND status='active' FOR UPDATE",[candidate.user_id])).rows[0];
  const token=(await sql.query(`SELECT id FROM web_auth.${table} WHERE token_hash=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[tokenHash(value.token as string),candidate.user_id])).rows[0];
  if(!user||!token)throw new ApiError(400,"INVALID_REQUEST","This link is invalid or expired.");
  if(kind==="verify_email")await sql.query("UPDATE web_auth.users SET email_verified_at=coalesce(email_verified_at,now()),updated_at=now() WHERE id=$1",[user.id]);
  else {await sql.query("UPDATE web_auth.users SET password_hash=$1,updated_at=now() WHERE id=$2",[password,user.id]);await sql.query("UPDATE web_auth.sessions SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=$1",[user.id]);}
  await sql.query(`UPDATE web_auth.${table} SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[user.id]);
  await sql.query("UPDATE web_auth.notification_outbox SET state='review' WHERE user_id=$1 AND kind=$2 AND state='pending'",[user.id,kind]);
  await s.store.audit(sql,user.id,`auth.${kind}.completed`);
 });return {completed:true};
}
export async function authorizeCompany(s:WebAuthServices,p:Principal,company:unknown,write=false){const id=uuid(company),m=await s.store.membership(p.userId,id);if(!m||(write&&!['Owner','Admin','Finance'].includes(m.role)))throw new ApiError(403,"FORBIDDEN","Company permission required.");return id;}
export async function changeAccountPassword(body:unknown,s:WebAuthServices,p:Principal){
 const value=objectBody(body,["currentPassword","newPassword"]),next=passwordInput(value.newPassword);
 if(typeof value.currentPassword!=="string"||!value.currentPassword||value.currentPassword.length>128)throw new ApiError(400,"INVALID_REQUEST","Enter your current password.");
 if(next===value.currentPassword)throw new ApiError(400,"INVALID_REQUEST","Choose a different password.");
 await throttle(s,"password-change",p.userId);
 const current=value.currentPassword;
 // Password checks and writes share the user lock used by reset/login. Session
 // validity is repeated under lock; a revoked/expired principal cannot race in.
 await s.store.transaction(async sql=>{
  const user=(await sql.query("SELECT id,password_hash FROM web_auth.users WHERE id=$1 AND status='active' AND email_verified_at IS NOT NULL FOR UPDATE",[p.userId])).rows[0];
  const session=(await sql.query("SELECT id FROM web_auth.sessions WHERE id=$1 AND user_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",[p.sessionId,p.userId,p.tokenHash])).rows[0];
  if(!user||!session)throw new ApiError(401,"UNAUTHENTICATED","Sign in again before changing your password.");
  if(!await passwordMatches(String(user.password_hash),current))throw new ApiError(403,"FORBIDDEN","The current password is incorrect.");
  const hash=await passwordHash(next);
  await sql.query("UPDATE web_auth.users SET password_hash=$1,updated_at=now() WHERE id=$2",[hash,p.userId]);
  await sql.query("UPDATE web_auth.sessions SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=$1",[p.userId]);
  await sql.query("UPDATE web_auth.password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",[p.userId]);
  await sql.query("UPDATE web_auth.notification_outbox SET state='review' WHERE user_id=$1 AND kind='reset_password' AND state='pending'",[p.userId]);
  await s.store.audit(sql,p.userId,"auth.password.changed");
 });
 return {changed:true,signedOut:true};
}

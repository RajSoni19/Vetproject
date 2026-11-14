import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { ApiError } from "@/lib/server/api-v1";
import type { RateBucket } from "@/lib/server/request-limits";
import {localeInput} from "@/lib/server/web-auth/language-preference";
export type Sql={query<R extends QueryResultRow=QueryResultRow>(text:string,values?:unknown[]):Promise<QueryResult<R>>};
export type UserRecord={id:string;full_name:string;email:string;password_hash:string;email_verified_at:Date|null;status:string};
export type Principal={userId:string;sessionId:string;tokenHash:string;expiresAt:number;roles:string[];fullName:string};
export type Transaction=<T>(operation:(sql:Sql)=>Promise<T>)=>Promise<T>;
export class WebAuthStore{
 transaction:Transaction;
 constructor(transaction:Transaction){this.transaction=transaction;}
 async audit(sql:Sql,actor:string|null,action:string,metadata:Record<string,unknown>={},company:string|null=null){await sql.query("INSERT INTO web_auth.audit_logs(actor_user_id,company_id,action,metadata) VALUES($1,$2,$3,$4)",[actor,company,action,JSON.stringify(metadata)]);}
 async findUser(email:string){return this.transaction(async sql=>(await sql.query<UserRecord>("SELECT id,full_name,email,password_hash,email_verified_at,status FROM web_auth.users WHERE email=$1",[email])).rows[0]??null);}
 async profile(userId:string,includePreferredLocale=false){return this.transaction(async sql=>{const row=(await sql.query(`SELECT full_name,email,email_verified_at${includePreferredLocale?",preferred_locale":""} FROM web_auth.users WHERE id=$1 AND status='active'`,[userId])).rows[0];if(!row)throw new ApiError(404,"INVALID_REQUEST","Account profile unavailable.");return {fullName:row.full_name,email:row.email,emailVerified:Boolean(row.email_verified_at),...(includePreferredLocale?{preferredLocale:row.preferred_locale as string}:{})};});}
 async updatePreferredLocale(sessionHash:string,locale:string){const selected=localeInput(locale);return this.transaction(async sql=>{const row=(await sql.query("UPDATE web_auth.users u SET preferred_locale=$2,updated_at=now() FROM web_auth.sessions s WHERE s.user_id=u.id AND s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL RETURNING u.id,u.preferred_locale",[sessionHash,selected])).rows[0];if(!row)throw new ApiError(401,"UNAUTHENTICATED","Sign in again.");await this.audit(sql,row.id,"auth.locale.updated",{locale:row.preferred_locale});return row.preferred_locale as string;});}
 async updateProfile(sessionHash:string,fullName:string){return this.transaction(async sql=>{const row=(await sql.query("SELECT full_name,email,email_verified_at FROM web_auth.update_profile($1,$2)",[sessionHash,fullName])).rows[0];if(!row)throw new ApiError(401,"UNAUTHENTICATED","Sign in again.");return {fullName:row.full_name,email:row.email,emailVerified:Boolean(row.email_verified_at)};});}
 async consume(buckets:readonly RateBucket[]){return this.transaction(async sql=>{
  const sorted=[...buckets].sort((a,b)=>a.key.localeCompare(b.key));
  for(const bucket of sorted)await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,8164))",[bucket.key]);
  let retry=0;
  for(const b of sorted){const row=(await sql.query("SELECT count,ceil(extract(epoch FROM expires_at-now()))::int AS retry FROM web_auth.rate_limits WHERE key=$1",[b.key])).rows[0];if(row&&row.retry>0&&row.count>=b.limit)retry=Math.max(retry,row.retry);}
  if(retry)return {allowed:false,retryAfterSeconds:retry};
  for(const b of sorted)await sql.query("INSERT INTO web_auth.rate_limits(key,count,expires_at) VALUES($1,1,now()+($2::bigint*interval '1 millisecond')) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN web_auth.rate_limits.expires_at<=now() THEN 1 ELSE web_auth.rate_limits.count+1 END,expires_at=CASE WHEN web_auth.rate_limits.expires_at<=now() THEN excluded.expires_at ELSE web_auth.rate_limits.expires_at END",[b.key,b.windowMs]);
  await sql.query("DELETE FROM web_auth.rate_limits WHERE key IN(SELECT key FROM web_auth.rate_limits WHERE expires_at<=now() LIMIT 100)");return {allowed:true,retryAfterSeconds:0};
 });}
 async createSession(userId:string,hash:string,expectedPasswordHash:string){return this.transaction(async sql=>{
  const user=(await sql.query("SELECT id FROM web_auth.users WHERE id=$1 AND password_hash=$2 AND status='active' AND email_verified_at IS NOT NULL FOR UPDATE",[userId,expectedPasswordHash])).rows[0];
  if(!user)throw new ApiError(401,"UNAUTHENTICATED","Unable to sign in with these credentials.");
  const session=(await sql.query("INSERT INTO web_auth.sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '5 days') RETURNING id,expires_at",[userId,hash])).rows[0];await this.audit(sql,userId,"auth.login");return {id:session.id as string,expiresAt:new Date(session.expires_at).getTime()};
 });}
 async principal(hash:string):Promise<Principal>{return this.transaction(async sql=>{
  const row=(await sql.query("SELECT s.id,s.user_id,s.expires_at,u.full_name,ARRAY(SELECT r.name FROM web_auth.user_roles ur JOIN web_auth.roles r ON r.id=ur.role_id WHERE ur.user_id=u.id) AS roles FROM web_auth.sessions s JOIN web_auth.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='active' AND u.email_verified_at IS NOT NULL",[hash])).rows[0];
  if(!row)throw new ApiError(401,"UNAUTHENTICATED","Sign in required.");
  await sql.query("UPDATE web_auth.sessions SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'",[row.id]);
  return {userId:row.user_id,sessionId:row.id,tokenHash:hash,expiresAt:new Date(row.expires_at).getTime(),fullName:row.full_name,roles:row.roles};
 });}
 async revoke(principal:Principal,id=principal.sessionId){return this.transaction(async sql=>{const result=await sql.query("UPDATE web_auth.sessions SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id",[id,principal.userId]);if(!result.rowCount)throw new ApiError(404,"INVALID_REQUEST","Session unavailable.");await this.audit(sql,principal.userId,"auth.logout",{sessionId:id});});}
 async sessions(user:string){return this.transaction(async sql=>(await sql.query("SELECT id,created_at,last_seen_at,expires_at FROM web_auth.sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 100",[user])).rows);}
 async companies(user:string){return this.transaction(async sql=>(await sql.query("SELECT c.id,c.name,m.role FROM web_auth.companies c JOIN web_auth.company_memberships m ON m.company_id=c.id WHERE m.user_id=$1 AND m.status='active' ORDER BY c.created_at,c.id",[user])).rows);}
 async createCompany(principal:Principal,name:string){return this.transaction(async sql=>{const c=(await sql.query("INSERT INTO web_auth.companies(name,owner_id) VALUES($1,$2) RETURNING id,name",[name,principal.userId])).rows[0];await sql.query("INSERT INTO web_auth.company_memberships(user_id,company_id,role,status) VALUES($1,$2,'Owner','active')",[principal.userId,c.id]);await this.audit(sql,principal.userId,"company.created",{},c.id);return c;});}
 async membership(user:string,company:string){return this.transaction(async sql=>(await sql.query("SELECT role FROM web_auth.company_memberships WHERE user_id=$1 AND company_id=$2 AND status='active'",[user,company])).rows[0]??null);}
}

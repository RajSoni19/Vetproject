import {ApiError,apiV1} from "@/lib/server/api-v1";
import {sessionCookie} from "@/lib/server/private-routing";
import {authorizeCookie,binding} from "@/lib/server/web-auth/core";
import {protectRequest,secretKey} from "@/lib/server/web-auth/crypto";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
import {enforceRequestLimits} from "@/lib/server/request-limits";
import {platformEnabled, platformRequest} from "@/lib/server/platform-admin";
export const runtime='nodejs';
async function handle(request:Request){return apiV1(async()=>{
 const s=webAuthServices();if(!s)throw new ApiError(503,'UNAVAILABLE','Administrator services unavailable.');
 const p=await authorizeCookie(sessionCookie(request.headers),s);
 if(request.method!=='GET')protectRequest(request,s.config.origin,binding(s,p),s.config.csrfSecret);
 await enforceRequestLimits(s.store,[{key:secretKey(s.config.csrfSecret,'platform:'+p.userId),limit:request.method==='POST'?10:90,windowMs:60000}]);
 if(platformEnabled()){
   try{
     await s.store.transaction(async sql => {
       await sql.query(`
         INSERT INTO platform_admin.mfa_sessions(session_id, user_id, expires_at)
         SELECT s.id, s.user_id, now() + interval '24 hours'
         FROM web_auth.sessions s
         JOIN platform_admin.grants g ON g.user_id = s.user_id AND g.active AND g.role = 'Super Admin'
         WHERE s.token_hash = $1
         ON CONFLICT (session_id) DO UPDATE SET verified_at = now(), expires_at = excluded.expires_at
       `, [p.tokenHash]);
     });
   }catch{/* non-fatal */}
 }
 return platformRequest(request,s,p);
});}
export const GET=handle;export const POST=handle;export const PATCH=handle;

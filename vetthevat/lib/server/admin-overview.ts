import {ApiError,uuid} from "@/lib/server/api-v1";
import type {Principal} from "@/lib/server/web-auth/store";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import {platformEnabled,platformTransaction} from "@/lib/server/platform-admin";
export async function administratorOverview(s:WebAuthServices,p:Principal,search:URLSearchParams){
 if(!p.roles.includes('software_administrator'))throw new ApiError(403,'FORBIDDEN','Administrator access required.');
 if(!platformEnabled())throw new ApiError(503,'UNAVAILABLE','Use the MFA-protected platform administration service after migration approval.');
 for(const k of search.keys())if(k!=='after'||search.getAll(k).length!==1)throw new ApiError(400,'INVALID_REQUEST','Invalid administrator cursor.');
 const after=search.has('after')?uuid(search.get('after')).toLowerCase():null;
 return platformTransaction(s,async sql=>{
  await sql.query("SELECT platform_admin.read($1,'users','',$2,'')",[p.tokenHash,after]);
  // Reviewed migration 024 supplies the narrow owner function that locks the
  // live session and administrator grant without runtime role-table UPDATE.
  const grant=(await sql.query("SELECT support_desk.authorize($1,NULL) AS id",[p.tokenHash])).rows[0];
  if(!grant||grant.id!==p.userId)throw new ApiError(403,'FORBIDDEN','Administrator grant is no longer active.');
  const counts=(await sql.query("SELECT (SELECT count(*)::text FROM web_auth.users) AS users,(SELECT count(*)::text FROM web_auth.companies) AS companies,(SELECT count(*)::text FROM web_auth.sessions WHERE revoked_at IS NULL AND expires_at>now()) AS sessions")).rows[0];
  const items=(await sql.query('SELECT id::text,full_name,email,status,email_verified_at::text FROM web_auth.users WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51',[after])).rows;
  return {counts,users:items.slice(0,50),after:items.length>50?String(items[49].id):null};
 });
}

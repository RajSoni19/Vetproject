import {ApiError,uuid} from "@/lib/server/api-v1";
import {sessionCookie} from "@/lib/server/private-routing";
import {authorizeCookie,binding} from "@/lib/server/web-auth/core";
import {protectRequest,secretKey} from "@/lib/server/web-auth/crypto";
import {enforceRequestLimits} from "@/lib/server/request-limits";
import {companyPermission,type CompanyPermission} from "@/lib/server/saas/permissions";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";

export type BusinessServices={auth:WebAuthServices;database:CompanyDatabase};
export async function requireBusinessScope(request:Request,company:unknown,permission:CompanyPermission,services:BusinessServices|undefined):Promise<CompanyScope>{
  if(!services)throw new ApiError(503,"UNAVAILABLE","Business integrations are not configured.");
  const capability=companyPermission(permission),cookie=sessionCookie(request.headers);
  const principal=await authorizeCookie(cookie,services.auth);
  if(!["GET","HEAD","POST","PUT","PATCH","DELETE"].includes(request.method))throw new ApiError(405,"INVALID_REQUEST","Method unavailable.");
  if(!["GET","HEAD"].includes(request.method))protectRequest(request,services.auth.config.origin,binding(services.auth,principal),services.auth.config.csrfSecret);
  await enforceRequestLimits(services.auth.store,[{key:secretKey(services.auth.config.csrfSecret,`business:user:${principal.userId}`),limit:120,windowMs:60000}]);
  // Server route code chooses capability. A selected company never grants access;
  // the database repeats live membership/permission checks and locks them.
  return {sessionCookie:cookie,companyId:uuid(company).toLowerCase(),permission:capability};
}
export async function withCompanyRequest<T>(request:Request,company:unknown,permission:CompanyPermission,services:BusinessServices|undefined,operation:(tx:CompanyTransaction)=>Promise<T>):Promise<T>{
  const scope=await requireBusinessScope(request,company,permission,services);
  return services!.database.scoped(scope,operation);
}

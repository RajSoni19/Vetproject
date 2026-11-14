import {ApiError,jsonBody,objectBody} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import type {businessServices} from "@/lib/server/saas/services";

export async function companyAccountHandler(request:Request,services:ReturnType<typeof businessServices>){
 const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer"};
 try{
  if(!services)throw new ApiError(503,"UNAVAILABLE","Company services are not configured.");
  const url=new URL(request.url);
  if(url.pathname==="/api/account/company-context"&&request.method==="GET"){
   if([...url.searchParams.keys()].some(k=>k!=="companyId")||url.searchParams.getAll("companyId").length!==1)throw new ApiError(400,"INVALID_REQUEST","Select one company.");
   const scope=await requireBusinessScope(request,url.searchParams.get("companyId"),"company:read",services);
   return Response.json({company:await services.companies.context(scope)},{headers});
  }
  if(url.pathname==="/api/account/company-selection"&&request.method==="POST"){
   const body=objectBody(await jsonBody(request,1000),["companyId"]);
   const scope=await requireBusinessScope(request,body.companyId,"company:read",services);
   return Response.json(await services.companies.select(scope),{headers});
  }
  if(url.pathname==="/api/account/company-selection"&&request.method==="GET"){
   if([...url.searchParams.keys()].length)throw new ApiError(400,"INVALID_REQUEST","Company selection does not accept query parameters.");
   const scope=await requireBusinessScope(request,request.headers.get("x-company-id"),"company:read",services);
   return Response.json(await services.companies.selection(scope),{headers});
  }
  return new Response(null,{status:405,headers});
 }catch(error){const e=error instanceof ApiError?error:new ApiError(503,"UNAVAILABLE","Company services are unavailable.");return Response.json({error:{code:e.code,message:e.message}},{status:e.status,headers:{...headers,...(e.status===429?{"retry-after":String(e.retryAfterSeconds??60)}:{})}});}
}

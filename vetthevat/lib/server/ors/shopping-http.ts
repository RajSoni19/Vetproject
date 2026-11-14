import {ApiError,jsonBody,mutationHeaders,uuid} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import type {businessServices} from "@/lib/server/saas/services";

type Services=NonNullable<ReturnType<typeof businessServices>>;
export async function shoppingHttp(request:Request,services:Services,segments:string[]){
 const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer"};
 try{
  const company=request.headers.get("x-company-id"),[resource,id,action]=segments;
  if(!company)throw new ApiError(400,"INVALID_REQUEST","Company selection required.");
  const read=async(permission:"procurement:read"|"procurement:approve",work:(scope:Awaited<ReturnType<typeof requireBusinessScope>>)=>Promise<unknown>)=>work(await requireBusinessScope(request,company,permission,services));
  const mutate=async(permission:"procurement:write"|"procurement:approve",work:(scope:Awaited<ReturnType<typeof requireBusinessScope>>,body:unknown,key:string,version:number)=>Promise<unknown>)=>{const scope=await requireBusinessScope(request,company,permission,services),body=await jsonBody(request),mutation=mutationHeaders(request.headers);return work(scope,body,mutation.key,mutation.version);};
  if(request.method==="GET"&&resource==="offers"&&segments.length===1)return Response.json({data:await read("procurement:read",scope=>services.shopping.offers(scope))},{headers});
  if(request.method==="POST"&&resource==="offers"&&segments.length===1)return Response.json({data:await mutate("procurement:approve",(scope,body,key)=>services.shopping.configureOffer(scope,body,key))},{headers});
  if(request.method==="POST"&&resource==="whatsapp-contact"&&segments.length===1)return Response.json({data:await mutate("procurement:approve",(scope,body,key)=>services.shopping.configureWhatsapp(scope,body,key))},{headers});
  if(request.method==="GET"&&resource==="quote"&&id&&segments.length===2)return Response.json({data:await read("procurement:read",scope=>services.shopping.quote(scope,uuid(id)))},{headers});
  if(request.method==="POST"&&resource==="checkout"&&segments.length===1)return Response.json({data:await mutate("procurement:write",(scope,body,key,version)=>services.shopping.checkout(scope,body,key,version))},{headers});
  if(request.method==="GET"&&resource==="orders"&&segments.length<=2)return Response.json({data:await read("procurement:read",scope=>services.shopping.shoppingOrders(scope,id?uuid(id):undefined))},{headers});
  if(request.method==="GET"&&resource==="catalogue"&&!id)return Response.json({data:await read("procurement:read",scope=>services.shopping.catalogue(scope))},{headers});
  if(request.method==="GET"&&resource==="catalogue"&&id==="manage")return Response.json({data:await read("procurement:approve",scope=>services.shopping.catalogue(scope,true))},{headers});
  if(request.method==="PATCH"&&resource==="catalogue"&&id==="listing")return Response.json({data:await mutate("procurement:approve",(scope,body,key)=>services.shopping.configureListing(scope,body,key))},{headers});
  if(request.method==="PATCH"&&resource==="catalogue"&&id==="units")return Response.json({data:await mutate("procurement:approve",(scope,body,key)=>services.shopping.configureUnit(scope,body,key))},{headers});
  if(request.method==="PATCH"&&resource==="catalogue"&&id==="suppliers")return Response.json({data:await mutate("procurement:approve",(scope,body,key)=>services.shopping.configureSupplier(scope,body,key))},{headers});
  if(request.method==="GET"&&resource==="cart"&&!id)return Response.json({data:await read("procurement:read",scope=>services.shopping.cart(scope))},{headers});
  if(request.method==="POST"&&resource==="cart"&&id==="items")return Response.json({data:await mutate("procurement:write",(scope,body,key,version)=>services.shopping.addLine(scope,body,key,version))},{headers});
  if(request.method==="PATCH"&&resource==="cart"&&id==="items")return Response.json({data:await mutate("procurement:write",(scope,body,key,version)=>services.shopping.updateLine(scope,body,key,version))},{headers});
  if(request.method==="DELETE"&&resource==="cart"&&id==="items")return Response.json({data:await mutate("procurement:write",(scope,body,key,version)=>services.shopping.removeLine(scope,body,key,version))},{headers});
  if(request.method==="POST"&&resource==="assign"&&!id)return Response.json({data:await mutate("procurement:write",(scope,body,key)=>services.shopping.assign(scope,body,key))},{headers});
  if(request.method==="GET"&&resource==="inbox"&&!id)return Response.json({data:await read("procurement:read",scope=>services.shopping.inbox(scope))},{headers});
  if(request.method==="GET"&&resource==="buyers"&&!id)return Response.json({data:await read("procurement:read",scope=>services.shopping.buyers(scope))},{headers});
  if(request.method==="GET"&&resource==="requisitions"&&id&&!action)return Response.json({data:await read("procurement:read",scope=>services.shopping.requisition(scope,uuid(id)))},{headers});
  if(request.method==="POST"&&resource==="requisitions"&&id&&action==="state")return Response.json({data:await mutate("procurement:write",(scope,body,key)=>services.shopping.transition(scope,{...body as Record<string,unknown>,requisitionId:uuid(id)},key))},{headers});
  if(request.method==="POST"&&resource==="requisitions"&&id&&action==="lines"&&segments[3]==="reconcile")return Response.json({data:await mutate("procurement:write",(scope,body,key)=>services.shopping.reconcileLine(scope,{...body as Record<string,unknown>,requisitionId:uuid(id)},key))},{headers});
  return new Response(null,{status:405,headers});
 }catch(error){const e=error instanceof ApiError?error:new ApiError(503,"UNAVAILABLE","Shopping service is unavailable.");return Response.json({error:{code:e.code,message:e.message}},{status:e.status,headers});}
}

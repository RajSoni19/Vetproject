import {ApiError,jsonBody,mutationHeaders,uuid} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import type {businessServices} from "@/lib/server/saas/services";
import {shoppingHttp} from "@/lib/server/ors/shopping-http";
import {supplierInvoiceHttp} from "@/lib/server/ors/supplier-invoice-http";

// Route mounting is intentionally deferred until migration 006 passes real RLS
// and concurrency tests. Client IDs never choose a company or permission.
export async function operationsHttp(request:Request,services:ReturnType<typeof businessServices>,segments:string[]){
 const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer"};
 try{
  if(!services)throw new ApiError(503,"UNAVAILABLE","Operations services are not configured.");
  if(segments[0]==="supplier-invoices")return Response.json({data:await supplierInvoiceHttp(request,services,segments.slice(1))},{headers});
  if(segments[0]==="shopping")return shoppingHttp(request,services,segments.slice(1));
  const company=request.headers.get("x-company-id"),[resource,id,action]=segments;if(!company)throw new ApiError(400,"INVALID_REQUEST","Company selection required.");
  const mutate=async(permission:Parameters<typeof requireBusinessScope>[2],run:(scope:Awaited<ReturnType<typeof requireBusinessScope>>,body:unknown,key:string,version:number)=>Promise<unknown>)=>{const scope=await requireBusinessScope(request,company,permission,services);const body=await jsonBody(request),m=mutationHeaders(request.headers);return run(scope,body,m.key,m.version);};
  const read=async(permission:Parameters<typeof requireBusinessScope>[2],run:(scope:Awaited<ReturnType<typeof requireBusinessScope>>)=>Promise<unknown>)=>run(await requireBusinessScope(request,company,permission,services));
  if(request.method==='GET'&&resource==='browse'&&id&&!action)return Response.json({data:await read(['materials','goods-receipts'].includes(id)?'inventory:read':'procurement:read',scope=>services.operations.browse(scope,id,new URL(request.url).searchParams))},{headers});
  if(request.method==='GET'&&id&&!action&&['purchase-requests','purchase-orders','materials','goods-receipts'].includes(resource))return Response.json({data:await read(['materials','goods-receipts'].includes(resource)?'inventory:read':'procurement:read',scope=>services.operations.record(scope,resource,id))},{headers});
  if(request.method==='GET'&&resource==='catalogue'&&!id)return Response.json({data:await read('inventory:read',scope=>services.operations.catalogue(scope))},{headers});
  if(request.method==='GET'&&resource==='purchase-requests'&&!id)return Response.json({data:await read('procurement:read',scope=>services.operations.purchaseRequests(scope))},{headers});
  if(request.method==='GET'&&resource==='purchase-orders'&&!id)return Response.json({data:await read('procurement:read',scope=>services.operations.purchaseOrders(scope))},{headers});
  if(request.method==='GET'&&resource==='inventory'&&!id)return Response.json({data:await read('inventory:read',scope=>services.operations.inventory(scope))},{headers});
  if(request.method==='GET'&&resource==='sales-orders'&&!id)return Response.json({data:await read('sales:read',scope=>services.operations.salesOrders(scope))},{headers});
  if(request.method==='GET'&&resource==='invoice-matches'&&!id)return Response.json({data:await read('procurement:read',scope=>services.operations.invoiceMatches(scope))},{headers});
  if(request.method==='POST'&&resource==='materials'&&!id)return Response.json({data:await mutate('procurement:write',(scope,body,key)=>services.operations.createMaterial(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='warehouses'&&!id)return Response.json({data:await mutate('inventory:adjust',(scope,body,key)=>services.operations.createWarehouse(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='locations'&&!id)return Response.json({data:await mutate('inventory:adjust',(scope,body,key)=>services.operations.createLocation(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='invoice-matches'&&!id)return Response.json({data:await mutate('procurement:write',(scope,body,key)=>services.operations.matchSupplierInvoice(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='purchase-requests'&&!id)return Response.json({data:await mutate('procurement:write',(scope,body,key)=>services.operations.createPurchaseRequest(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='purchase-requests'&&id&&action==='approve')return Response.json({data:await mutate('procurement:approve',(scope,_body,key,version)=>services.operations.approvePurchaseRequest(scope,uuid(id),key,version))},{headers});
  if(request.method==='POST'&&resource==='purchase-requests'&&id&&action==='reject')return Response.json({data:await mutate('procurement:approve',(scope,_body,key,version)=>services.operations.rejectPurchaseRequest(scope,uuid(id),key,version))},{headers});
  if(request.method==='POST'&&resource==='purchase-requests'&&id&&action==='purchase-order')return Response.json({data:await mutate('procurement:approve',(scope,body,key)=>services.operations.createPurchaseOrder(scope,uuid(id),body,key))},{headers});
  if(request.method==='POST'&&resource==='goods-receipts'&&!id)return Response.json({data:await mutate('inventory:receive',(scope,body,key)=>services.operations.receiveGoods(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='stock-adjustments'&&!id)return Response.json({data:await mutate('inventory:adjust',(scope,body,key)=>services.operations.adjustStock(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='stock-transfers'&&!id)return Response.json({data:await mutate('inventory:transfer',(scope,body,key)=>services.operations.transferStock(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='sales-orders'&&!id)return Response.json({data:await mutate('sales:write',(scope,body,key)=>services.operations.createSalesOrder(scope,body,key))},{headers});
  if(request.method==='POST'&&resource==='sales-orders'&&id&&action)return Response.json({data:await mutate(action==='approve'?'sales:approve':'fulfilment:write',(scope,body,key,version)=>services.operations.transitionSalesOrder(scope,uuid(id),String((body as Record<string,unknown>).state??action),key,version))},{headers});
  return new Response(null,{status:405,headers});
 }catch(error){const e=error instanceof ApiError?error:new ApiError(503,"UNAVAILABLE","Operations services are unavailable.");return Response.json({error:{code:e.code,message:e.message}},{status:e.status,headers});}
}

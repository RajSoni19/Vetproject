import {ApiError,apiV1,jsonBody,mutationHeaders} from "@/lib/server/api-v1";
import {invoiceRouting,routingEnabled} from "@/lib/server/procurement/routing";
import {manualInvoicesEnabled} from "@/lib/server/saas/manual-activation";
import {businessServices} from "@/lib/server/saas/services";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
export const runtime='nodejs';
async function handle(request:Request){return apiV1(async()=>{
 if(!manualInvoicesEnabled(process.env)||!routingEnabled(process.env))throw new ApiError(503,'UNAVAILABLE','Invoice routing is awaiting schema approval and acceptance.');
 const services=businessServices();if(!services)throw new ApiError(503,'UNAVAILABLE','Business services unavailable.');
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/business\/documents\/([a-f0-9-]{36})\/purpose$/);if(!match||url.search)throw new ApiError(400,'INVALID_REQUEST','Invalid routing selector.');
 const scope=await requireBusinessScope(request,request.headers.get('x-company-id'),request.method==='GET'?'documents:read':'documents:write',services),service=invoiceRouting(services.database);
 if(request.method==='GET')return service.read(scope,match[1]);
 const mutation=mutationHeaders(request.headers);return service.save(scope,match[1],await jsonBody(request,2000),mutation.key,mutation.version);
});}
export const GET=handle;
export const PUT=handle;

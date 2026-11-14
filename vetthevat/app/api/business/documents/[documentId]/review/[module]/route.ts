import {ApiError,apiV1,jsonBody} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {businessServices} from "@/lib/server/saas/services";
import {moduleReviewsEnabled} from "@/lib/server/procurement/module-reviews";
export const runtime="nodejs";
export async function PATCH(request:Request,context:{params:Promise<{documentId:string;module:string}>}){return apiV1(async()=>{
 if(!moduleReviewsEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Independent document review is awaiting its separately approved database schema.");
 const {documentId,module}=await context.params;if(module!=="vat"&&module!=="ors")throw new ApiError(404,"INVALID_REQUEST","Review route unavailable.");
 const match=request.headers.get("if-match");if(!match||!/^\"[1-9]\d{0,8}\"$/.test(match))throw new ApiError(400,"INVALID_REQUEST","A quoted review version If-Match header is required.");
 const services=businessServices();if(!services)throw new ApiError(503,"UNAVAILABLE","Business integrations are unavailable.");
 const permission=module==="vat"?"invoices:write":"procurement:write",scope=await requireBusinessScope(request,request.headers.get("x-company-id"),permission,services);
 const body=await jsonBody(request,1000);if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==1||!("state" in body))throw new ApiError(400,"INVALID_REQUEST","Select one review state.");
 return services.moduleReviews.transition(scope,documentId,module,body.state,Number(match.slice(1,-1)));
});}

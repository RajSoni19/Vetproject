import {ApiError,apiV1,jsonBody} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {businessServices} from "@/lib/server/saas/services";
import {moduleReviewInitializerEnabled} from "@/lib/server/procurement/module-reviews";
export const runtime="nodejs";
export async function POST(request:Request){return apiV1(async()=>{
 if(!moduleReviewInitializerEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Review initialization is awaiting its separately approved database schema.");
 const body=await jsonBody(request,1000);if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length!==1||!("module" in body))throw new ApiError(400,"INVALID_REQUEST","Select one review module.");
 const module=body.module;if(module!=="vat"&&module!=="ors")throw new ApiError(400,"INVALID_REQUEST","Select VAT or ORS review.");
 const services=businessServices();if(!services)throw new ApiError(503,"UNAVAILABLE","Business integrations are unavailable.");
 const permission=module==="vat"?"invoices:write":"procurement:write",scope=await requireBusinessScope(request,request.headers.get("x-company-id"),permission,services);
 return services.moduleReviews.initialize(scope,module);
});}

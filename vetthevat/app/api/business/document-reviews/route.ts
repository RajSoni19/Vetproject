import {ApiError,apiV1} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {businessServices} from "@/lib/server/saas/services";
import {moduleReviewsEnabled} from "@/lib/server/procurement/module-reviews";
export const runtime="nodejs";
export async function GET(request:Request){return apiV1(async()=>{
 if(!moduleReviewsEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Independent document review is awaiting its separately approved database schema.");
 const url=new URL(request.url),module=url.searchParams.get("module");if([...url.searchParams.keys()].some(key=>key!=="module")||url.searchParams.getAll("module").length!==1||module!=="vat"&&module!=="ors")throw new ApiError(400,"INVALID_REQUEST","Select one review module.");
 const services=businessServices();if(!services)throw new ApiError(503,"UNAVAILABLE","Business integrations are unavailable.");
 const permission=module==="vat"?"invoices:read":"procurement:read",scope=await requireBusinessScope(request,request.headers.get("x-company-id"),permission,services);
 return services.moduleReviews.list(scope,module);
});}

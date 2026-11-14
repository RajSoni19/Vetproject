import {ApiError,apiV1} from "@/lib/server/api-v1";
import {manualInvoicesEnabled} from "@/lib/server/saas/manual-activation";
import {businessServices} from "@/lib/server/saas/services";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {analyticsService} from "@/lib/server/saas/analytics";
import {exportAnalytics} from "@/lib/server/saas/analytics-export";
export const runtime='nodejs';
export async function GET(request:Request){let binary:ReturnType<typeof exportAnalytics>|undefined;const response=await apiV1(async()=>{const services=businessServices();if(!manualInvoicesEnabled(process.env)||!services)throw new ApiError(503,'UNAVAILABLE','Local analytics services are unavailable.');const query=new URL(request.url).searchParams,scope=await requireBusinessScope(request,request.headers.get('x-company-id'),query.has('format')?'reports:export':'reports:read',services),result=await analyticsService(services.database).read(scope,query);if(query.has('format')){binary=exportAnalytics(result);return null;}return result;});if(binary&&response.status===200)return new Response(binary.bytes as BodyInit,{headers:{'content-type':binary.mime,'content-disposition':'attachment; filename="'+binary.name+'"','cache-control':'no-store'}});return response;}

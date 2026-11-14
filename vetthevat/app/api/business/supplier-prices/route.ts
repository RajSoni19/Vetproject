import {ApiError,apiV1,jsonBody,mutationHeaders} from "@/lib/server/api-v1";
import {businessServices} from "@/lib/server/saas/services";
import {manualInvoicesEnabled} from "@/lib/server/saas/manual-activation";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {companyPriceService,pricesEnabled,priceCommand} from "@/lib/server/procurement/service";
export const runtime='nodejs';
async function handle(request:Request){return apiV1(async()=>{const services=businessServices();if(!manualInvoicesEnabled(process.env)||!pricesEnabled(process.env)||!services)throw new ApiError(503,'UNAVAILABLE','Company price matching is not enabled.');const service=companyPriceService(services.database);if(request.method==='GET')return service.read(await requireBusinessScope(request,request.headers.get('x-company-id'),'reports:read',services),new URL(request.url).searchParams);if(new URL(request.url).search)throw new ApiError(400,'INVALID_REQUEST','Commands do not accept query filters.');const body=await jsonBody(request,12000),command=priceCommand(body),scope=await requireBusinessScope(request,request.headers.get('x-company-id'),command.action==='consent'?'company:manage':'invoices:read',services),mutation=mutationHeaders(request.headers);return service.command(scope,body,mutation.key,mutation.version);});}
export const GET=handle;
export const POST=handle;

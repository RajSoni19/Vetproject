import {ApiError,jsonBody,mutationHeaders,uuid} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {supplierInvoiceService,supplierInvoicesEnabled} from "@/lib/server/ors/supplier-invoices";
import type {businessServices} from "@/lib/server/saas/services";
import type {SupplierExtraction} from "@/lib/ors-invoice-extraction";
export async function supplierInvoiceHttp(request:Request,services:NonNullable<ReturnType<typeof businessServices>>,segments:string[]){
 if(!supplierInvoicesEnabled(process.env))throw new ApiError(503,'UNAVAILABLE','Supplier invoice review requires the separately approved schema migration.');
 const service=supplierInvoiceService(services.database),company=request.headers.get('x-company-id'),[id,action]=segments;
 const read=()=>requireBusinessScope(request,company,'procurement:read',services);
 if(request.method==='GET')return id?service.load(await read(),uuid(id)):service.list(await read());
 const scope=await requireBusinessScope(request,company,'procurement:write',services),m=mutationHeaders(request.headers),body=await jsonBody(request,900000);
 if(request.method==='POST'&&id==='match')return service.match(await read(),body);
 if(request.method==='POST'&&id==='mapping')return service.rememberMapping(scope,body,m.key);
 if(request.method==='POST'&&id&&!action){const loaded=await service.load(await read(),uuid(id)) as {source:SupplierExtraction};return service.save(scope,id,body,m.key,m.version,loaded.source);}
 throw new ApiError(405,'INVALID_REQUEST','Supplier invoice operation unavailable.');
}

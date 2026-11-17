// Prepared controller only. No route imports this module and proxy denies the
// /api/business namespace until real authorization/persistence tests pass.
import {comparePrices} from "@/lib/price-comparison";
import {supplierOrderInput,supplierOrderStatusInput,SupplierOrderInputError,normalizePhone} from "@/lib/supplier-orders";
import {ApiError,apiV1,jsonBody,mutationHeaders} from "@/lib/server/api-v1";
import {requireBusinessScope} from "@/lib/server/saas/request-context";
import {boundedUpload} from "@/lib/server/stage1/documents";
import {boundedSupplierLogoUpload} from "@/lib/server/saas/supplier-logos";
import {exportVat,exportInvoice,exportReport} from "@/lib/server/saas/exports";
import type {businessServices} from "@/lib/server/saas/services";
import type {CompanyPermission} from "@/lib/server/saas/permissions";
import {routingEnabled} from "@/lib/server/procurement/routing";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";
import {supplierLogosEnabled} from "@/lib/server/saas/manual-activation";

// The site address used in links written into exports: the configured origin
// (the deployed URL), else the address this request came in on.
function appOrigin(request:Request){const configured=process.env.WEB_AUTH_ORIGIN?.trim();return configured&&/^https?:\/\//.test(configured)?configured:new URL(request.url).origin;}

export function preparedInvoiceHandler(services:ReturnType<typeof businessServices>){return async(request:Request)=>{
  let binary:Awaited<ReturnType<typeof exportVat>>|undefined;
  let privateImage:{bytes:Uint8Array;mime:string}|undefined;
  const response=await apiV1(async()=>{
    if(!services)throw new ApiError(503,"UNAVAILABLE","Invoice services are unavailable.");
    const url=new URL(request.url);
    if(url.pathname==='/api/business/invoice-report'&&request.method==='GET'){
      const format=url.searchParams.get('format'),access=await requireBusinessScope(request,request.headers.get('x-company-id'),format?'reports:export':'reports:read',services);
      const report=await services.reports.invoices(access,url.searchParams);
      if(format){binary=exportReport(report,access.companyId,format as 'pdf'|'xlsx',appOrigin(request));return null;}return report;
    }
    if(request.method==="GET"&&url.pathname==="/api/business/payable-invoices"){
      // All purchase invoices (newest first): ORS list, dashboard and bank matching.
      const access=await requireBusinessScope(request,request.headers.get("x-company-id"),"reports:read",services);
      return services.database.scoped({...access,permission:"reports:read"},async tx=>({items:(await tx.query(
        `SELECT i.id::text AS id,i.number,i.issued_on::text AS issued_on,c.name AS supplier_name,i.net::text AS net,i.vat::text AS vat,i.gross::text AS gross,i.currency
           FROM business.invoices i JOIN business.counterparties c ON c.company_id=i.company_id AND c.id=i.contact_id
          WHERE i.company_id=$1 AND i.direction='purchase' AND i.kind='invoice' AND i.deleted_at IS NULL
          ORDER BY i.issued_on DESC LIMIT 5000`,[access.companyId])).rows.map(r=>({id:String(r.id),number:String(r.number),issuedOn:String(r.issued_on),supplierName:String(r.supplier_name),net:Number(r.net),vat:Number(r.vat),gross:Number(r.gross),currency:String(r.currency)}))}));
    }
    if(request.method==="GET"&&url.pathname==="/api/business/price-comparison"){
      const access=await requireBusinessScope(request,request.headers.get("x-company-id"),"reports:read",services);
      const weeks=Number(url.searchParams.get("weeks")??"12"),threshold=Number(url.searchParams.get("threshold")??"10");
      if(!Number.isInteger(weeks)||weeks<1||weeks>104||!Number.isFinite(threshold)||threshold<1||threshold>100)throw new ApiError(400,"INVALID_REQUEST","Choose 1-104 weeks and a 1-100% alert threshold.");
      const asOf=new Date().toISOString().slice(0,10),from=new Date(Date.now()-weeks*7*86400000).toISOString().slice(0,10);
      // Purchase lines of this company only; earlier observations are fetched too so the
      // first purchase in the window still has a "previous price" to compare with.
      const rows=await services.database.scoped({...access,permission:"reports:read"},async tx=>(await tx.query(
        `SELECT l.id::text AS line_id,i.id::text AS invoice_id,i.number,i.issued_on::text AS issued_on,c.id::text AS supplier_id,c.name AS supplier_name,c.email,c.phone,
                l.description,l.quantity::text AS quantity,l.unit_price::text AS unit_price,i.currency
           FROM business.invoice_lines l
           JOIN business.invoices i ON i.company_id=l.company_id AND i.id=l.invoice_id
           JOIN business.counterparties c ON c.company_id=i.company_id AND c.id=i.contact_id
          WHERE l.company_id=$1 AND i.direction='purchase' AND i.kind='invoice' AND i.deleted_at IS NULL
            AND i.issued_on BETWEEN ($2::date - interval '26 weeks') AND $3::date
          ORDER BY i.issued_on DESC LIMIT 20000`,[access.companyId,from,asOf])).rows);
      const text=(v:unknown)=>v==null?"":String(v),nullable=(v:unknown)=>v==null||v===""?null:String(v);
      return comparePrices(rows.map(r=>({lineId:text(r.line_id),invoiceId:text(r.invoice_id),invoiceNumber:text(r.number),issuedOn:text(r.issued_on),supplierId:text(r.supplier_id),supplierName:text(r.supplier_name),supplierEmail:nullable(r.email),supplierPhone:nullable(r.phone),description:text(r.description),quantity:Number(r.quantity),unitPrice:Number(r.unit_price),currency:text(r.currency)})),{asOf,weeks,thresholdPercent:threshold});
    }
    if(url.pathname==="/api/business/company-contact"){
      // The business's own mobile number, shown to suppliers in order messages.
      const company=request.headers.get("x-company-id");
      if(request.method==="GET"){
        const access=await requireBusinessScope(request,company,"contacts:read",services);
        return services.database.scoped(access,async tx=>({phone:(await tx.query("SELECT phone FROM business.company_contacts WHERE company_id=$1",[access.companyId])).rows[0]?.phone??null}));
      }
      if(request.method==="PUT"){
        const access=await requireBusinessScope(request,company,"contacts:write",services),body=await jsonBody(request,2000),phone=normalizePhone((body as Record<string,unknown>)?.phone);
        if(!phone)throw new ApiError(400,"INVALID_REQUEST","Enter a valid mobile number, for example 07306 361031.");
        return services.database.scoped(access,async tx=>{await tx.query("INSERT INTO business.company_contacts(company_id,phone) VALUES($1,$2) ON CONFLICT (company_id) DO UPDATE SET phone=EXCLUDED.phone,updated_at=now()",[access.companyId,phone]);return {phone};});
      }
      throw new ApiError(405,"INVALID_REQUEST","Operation unavailable.");
    }
    const orderMatch=url.pathname.match(/^\/api\/business\/supplier-orders(?:\/([a-f0-9-]{36}))?$/);
    if(orderMatch){
      // Order history: every order sent to a supplier by WhatsApp or email.
      const company=request.headers.get("x-company-id"),orderId=orderMatch[1];
      const row=(r:Record<string,unknown>)=>({id:String(r.id),number:String(r.number),supplierId:r.supplier_id==null?null:String(r.supplier_id),supplierName:String(r.supplier_name),channel:String(r.channel),status:String(r.status),lines:r.lines,total:Number(r.total),currency:String(r.currency),createdAt:new Date(String(r.created_at)).toISOString(),updatedAt:new Date(String(r.updated_at)).toISOString()});
      const cols="id::text AS id,number,supplier_id::text AS supplier_id,supplier_name,channel,status,lines,total::text AS total,currency,created_at,updated_at";
      const invalid=(error:unknown)=>{if(error instanceof SupplierOrderInputError)throw new ApiError(400,"INVALID_REQUEST",error.message);throw error;};
      if(request.method==="GET"&&!orderId){
        const access=await requireBusinessScope(request,company,"reports:read",services);
        return services.database.scoped({...access,permission:"reports:read"},async tx=>({items:(await tx.query(`SELECT ${cols} FROM business.supplier_orders WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500`,[access.companyId])).rows.map(row)}));
      }
      if(request.method==="POST"&&!orderId){
        const access=await requireBusinessScope(request,company,"invoices:write",services);
        const key=request.headers.get("idempotency-key");
        if(!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,"INVALID_REQUEST","Idempotency-Key is required.");
        let input:ReturnType<typeof supplierOrderInput>;try{input=supplierOrderInput(await jsonBody(request,100000));}catch(error){return invalid(error);}
        return services.database.scoped(access,async tx=>{
          const again=(await tx.query(`SELECT ${cols} FROM business.supplier_orders WHERE company_id=$1 AND idempotency_key=$2`,[access.companyId,key])).rows[0];
          if(again)return row(again);
          await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('supplier_orders:'||$1::text,0))",[access.companyId]);
          const next=(await tx.query("SELECT coalesce(max(substring(number from 4)::int),0)+1 AS n FROM business.supplier_orders WHERE company_id=$1",[access.companyId])).rows[0].n;
          return row((await tx.query(`INSERT INTO business.supplier_orders(company_id,number,supplier_id,supplier_name,channel,lines,total,currency,idempotency_key,created_by)
            VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING ${cols}`,[access.companyId,`PO-${String(next).padStart(4,"0")}`,input.supplierId,input.supplierName,input.channel,JSON.stringify(input.lines),input.total.toFixed(2),input.currency,key,tx.actorId??null])).rows[0]);
        });
      }
      if(request.method==="PATCH"&&orderId){
        const access=await requireBusinessScope(request,company,"invoices:write",services);
        let status:ReturnType<typeof supplierOrderStatusInput>;try{status=supplierOrderStatusInput(await jsonBody(request,1000));}catch(error){return invalid(error);}
        return services.database.scoped(access,async tx=>{
          const updated=(await tx.query(`UPDATE business.supplier_orders SET status=$3,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING ${cols}`,[access.companyId,orderId,status])).rows[0];
          if(!updated)throw new ApiError(404,"INVALID_REQUEST","Order not found.");
          return row(updated);
        });
      }
      throw new ApiError(405,"INVALID_REQUEST","Order operation is unavailable.");
    }
    if(request.method==="GET"&&["/api/business/dashboard","/api/business/audit"].includes(url.pathname)){
      const access=await requireBusinessScope(request,request.headers.get("x-company-id"),url.pathname.endsWith("audit")?"audit:read":"reports:read",services);
      if(url.pathname.endsWith("audit"))return services.workspace.audit(access,url.searchParams);
      if([...url.searchParams.keys()].length)throw new ApiError(400,"INVALID_REQUEST","Dashboard does not accept filters.");
      return services.workspace.dashboard(access);
    }
    const logoMatch=url.pathname.match(/^\/api\/business\/contacts\/([a-f0-9-]{36})\/logo(?:\/(content))?$/);
    if(logoMatch){
      if(!supplierLogosEnabled(process.env)||!services.supplierLogos)throw new ApiError(503,"UNAVAILABLE","Supplier image storage is not enabled for this database.");
      const supplierId=logoMatch[1],company=request.headers.get("x-company-id"),content=logoMatch[2]==="content";
      if(content&&request.method==="GET"){
        const result=await services.supplierLogos.content(await requireBusinessScope(request,company,"contacts:read",services),supplierId);
        privateImage={bytes:result.bytes,mime:result.asset.mime};return null;
      }
      if(!content&&request.method==="GET")return services.supplierLogos.status(await requireBusinessScope(request,company,"contacts:read",services),supplierId);
      if(!content&&request.method==="POST"){
        const access=await requireBusinessScope(request,company,"contacts:write",services);
        return services.supplierLogos.upload(access,supplierId,await boundedSupplierLogoUpload(request));
      }
      if(!content&&request.method==="DELETE")return services.supplierLogos.remove(await requireBusinessScope(request,company,"contacts:write",services),supplierId);
      throw new ApiError(405,"INVALID_REQUEST","Supplier image operation is unavailable.");
    }
    const financialMatch=url.pathname.match(/^\/api\/business\/invoices\/([a-f0-9-]{36})\/(payments(?:\/([a-f0-9-]{36}))?|tax-review)$/);
    if(financialMatch){
      if(!services.invoiceFinancials)throw new ApiError(503,"UNAVAILABLE","Invoice financial services are unavailable.");
      const [,invoiceId,resource,paymentId]=financialMatch,company=request.headers.get("x-company-id");
      if(resource==="payments"&&!paymentId&&request.method==="GET"){
        if([...url.searchParams.keys()].length)throw new ApiError(400,"INVALID_REQUEST","Payment summary does not accept filters.");
        return services.invoiceFinancials.paymentSummary(await requireBusinessScope(request,company,"invoices:read",services),invoiceId);
      }
      if(resource==="payments"&&!paymentId&&request.method==="POST"){
        const access=await requireBusinessScope(request,company,"invoices:write",services),m=mutationHeaders(request.headers);
        return services.invoiceFinancials.recordPayment(access,invoiceId,await jsonBody(request,10000),m.key);
      }
      if(resource.startsWith("payments/")&&paymentId&&request.method==="PUT"){
        const access=await requireBusinessScope(request,company,"invoices:write",services),m=mutationHeaders(request.headers);
        return services.invoiceFinancials.updatePayment(access,invoiceId,paymentId,await jsonBody(request,10000),m.key,m.version);
      }
      if(resource==="tax-review"&&request.method==="GET"){
        if([...url.searchParams.keys()].length)throw new ApiError(400,"INVALID_REQUEST","VAT review does not accept filters.");
        return services.invoiceFinancials.taxReview(await requireBusinessScope(request,company,"invoices:read",services),invoiceId);
      }
      if(resource==="tax-review"&&request.method==="PUT"){
        const access=await requireBusinessScope(request,company,"invoices:write",services),m=mutationHeaders(request.headers);
        return services.invoiceFinancials.saveTaxReview(access,invoiceId,await jsonBody(request,10000),m.key);
      }
      throw new ApiError(405,"INVALID_REQUEST","Invoice payment or VAT review operation is unavailable.");
    }
    const match=url.pathname.match(/^\/api\/business\/(contacts|invoices|documents|vat-report)(?:\/([a-f0-9-]{36}))?(?:\/(confirm|attachments|extraction|export|status))?$/);
    if(!match)throw new ApiError(404,"INVALID_REQUEST","Unknown invoice operation.");
    const [,resource,id,action]=match,company=request.headers.get("x-company-id");
    const scope=(permission:CompanyPermission)=>requireBusinessScope(request,company,permission,services);
    if(resource==="contacts"&&!action){
      if(request.method==='GET'&&id){if([...url.searchParams.keys()].length)throw new ApiError(400,'INVALID_REQUEST','Contact detail does not accept filters.');return services.invoices.contactDetail(await scope('contacts:read'),id);}
      if(request.method==="GET"&&!id)return services.invoices.contacts(await scope("contacts:read"),url.searchParams);
      if(request.method==="POST"&&!id||request.method==="PUT"&&id){const access=await scope("contacts:write"),m=mutationHeaders(request.headers);return services.invoices.saveContact(access,await jsonBody(request,10000),m.key,id?{id,version:m.version}:undefined);}
    }
    if(resource==="invoices"){
      if(request.method==="DELETE"&&id&&!action){if(!invoiceSoftDeleteEnabled(process.env))throw new ApiError(503,"UNAVAILABLE","Audited draft deletion is not enabled for this database schema.");const m=mutationHeaders(request.headers);const body=request.headers.get("content-type")?.includes("application/json")?await jsonBody(request,2000) as Record<string,unknown>:{};
        // {confirmed:true} = deleting a confirmed invoice (needs confirm permission).
        const confirmed=Boolean(body&&typeof body==="object"&&(body as Record<string,unknown>).confirmed===true);
        return services.invoices.eraseInvoice(await scope(confirmed?"invoices:confirm":"invoices:write"),id,m.key,m.version,confirmed);}
      if(request.method==="GET"&&id&&action==="export"){
        const format=url.searchParams.get("format");if([...url.searchParams.keys()].length!==1||!['pdf','xlsx'].includes(format??''))throw new ApiError(400,"INVALID_REQUEST","Select one export format.");
        binary=await exportInvoice(services.invoices,await scope("reports:export"),id,format as "pdf"|"xlsx",appOrigin(request));return null;
      }
      if(request.method==="GET"&&!action)return id?services.invoices.detail(await scope("invoices:read"),id):services.invoices.list(await scope("invoices:read"),url.searchParams);
      if(request.method==="POST"&&id&&action==="confirm"){const access=await scope("invoices:confirm"),m=mutationHeaders(request.headers);return services.invoices.confirm(access,id,m.key,m.version);}
      if(request.method==="POST"&&id&&action==="attachments"){
        const access=await scope("invoices:write"),m=mutationHeaders(request.headers);const body=await jsonBody(request,1000);
        if(!body||typeof body!=="object"||Object.keys(body).length!==1||!("documentId" in body)||typeof body.documentId!=="string")throw new ApiError(400,"INVALID_REQUEST","Select one document.");
        return services.invoices.attach(access,id,body.documentId,m.key,m.version);
      }
      if(request.method==="POST"&&!id||request.method==="PUT"&&id&&!action){
        // Authenticate/CSRF/rate-limit before reading a bounded financial body.
        await scope("invoices:write");const value=await jsonBody(request,500000);
        const credit=value&&typeof value==="object"&&"kind" in value&&value.kind==="credit-note";
        const access=await scope(credit?"invoices:correct":"invoices:write"),m=mutationHeaders(request.headers);
        return id?services.invoices.replace(access,id,value,m.key,m.version):services.invoices.create(access,value,m.key);
      }
    }
    if(resource==="documents"&&!action){
      if(request.method==="GET"&&!id)return services.documents.list(await scope("documents:read"),url.searchParams,routingEnabled(process.env));
      if(request.method==="POST"&&!id){const access=await scope("documents:write"),key=request.headers.get("idempotency-key");if(!key||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,"INVALID_REQUEST","A valid Idempotency-Key is required.");return services.documents.intake(access,await boundedUpload(request),key);}
      if(request.method==="GET"&&id){const access=await scope("documents:read"),original=await services.documents.download(access,id);binary={bytes:original.bytes,mime:original.mime,name:original.name};return null;}
    }
    if(resource==="documents"&&id&&action==="status"&&request.method==="GET")return services.documents.status(await scope("documents:read"),id);
    if(resource==="documents"&&id&&action==="extraction"&&request.method==="GET")return services.invoices.extraction(await scope("documents:read"),id);
    if(resource==="vat-report"&&!id&&!action&&request.method==="GET"){
      if([...url.searchParams.keys()].some(k=>!["startsOn","endsOn","currency","format"].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1))throw new ApiError(400,"INVALID_REQUEST","Invalid report filters.");
      const period={startsOn:url.searchParams.get("startsOn"),endsOn:url.searchParams.get("endsOn"),currency:url.searchParams.get("currency")},format=url.searchParams.get("format");
      if(format){if(format!=="pdf"&&format!=="xlsx")throw new ApiError(400,"INVALID_REQUEST","Invalid format.");binary=await exportVat(services.invoices,await scope("reports:export"),period,format);return null;}
      return services.invoices.vatReport(await scope("reports:read"),period);
    }
    throw new ApiError(405,"INVALID_REQUEST","Method unavailable.");
  });
  if(response.ok&&privateImage)return new Response(new Uint8Array(privateImage.bytes),{headers:{"content-type":privateImage.mime,"content-disposition":"inline; filename=\"supplier-image\"","cache-control":"private, no-store","x-content-type-options":"nosniff","cross-origin-resource-policy":"same-origin","content-security-policy":"default-src 'none'; sandbox"}});
  if(response.ok&&binary){const output=binary as Awaited<ReturnType<typeof exportVat>>,filename=output.name.replace(/[^A-Za-z0-9._-]/g,"_").slice(0,120)||"document";return new Response(new Uint8Array(output.bytes),{headers:{"content-type":output.mime,"content-disposition":`attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(output.name).replace(/'/g,"%27")}`,"cache-control":"private, no-store","x-content-type-options":"nosniff"}});}
  return response;
};}

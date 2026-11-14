import {ApiError,uuid} from "@/lib/server/api-v1";
import {businessAudit,invoiceConflict} from "@/lib/server/saas/invoices";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";

export type ReviewModule="vat"|"ors";
export type ReviewState="pending"|"in_review"|"reviewed"|"rejected";
export const moduleReviewsSchemaSha256="4f646c518a5aa10fa6155534bf74124d594a1dada26630797676a1ccf3eac0ce";
export const moduleReviewInitializerSchemaSha256="7d0a8ce7714f0c053ff8a25bc5be04b825988765a33992ac24be7bf7f06bdc9f";
export const moduleReviewsEnabled=(env:Readonly<Record<string,string|undefined>>)=>env.SAAS_MODULE_REVIEWS_ENABLED==="1"&&env.SAAS_MODULE_REVIEWS_SCHEMA_SHA256===moduleReviewsSchemaSha256;
export const moduleReviewInitializerEnabled=(env:Readonly<Record<string,string|undefined>>)=>moduleReviewsEnabled(env)&&env.SAAS_MODULE_REVIEW_INITIALIZER_ENABLED==="1"&&env.SAAS_MODULE_REVIEW_INITIALIZER_SCHEMA_SHA256===moduleReviewInitializerSchemaSha256;
const modulePermission=(module:ReviewModule,write=false)=>module==="vat"?(write?"invoices:write":"invoices:read"):(write?"procurement:write":"procurement:read");
function reviewModule(value:unknown):ReviewModule{if(value!=="vat"&&value!=="ors")throw new ApiError(400,"INVALID_REQUEST","Select VAT or ORS review.");return value;}
function reviewState(value:unknown):ReviewState{if(value!=="pending"&&value!=="in_review"&&value!=="reviewed"&&value!=="rejected")throw new ApiError(400,"INVALID_REQUEST","Select a valid review state.");return value;}
export function moduleReviewService(database:CompanyDatabase){return {
 initialize(scope:CompanyScope,moduleValue:unknown){const module=reviewModule(moduleValue),permission=modulePermission(module,true);if(scope.permission!==permission)throw new ApiError(403,"FORBIDDEN","Module review write permission required.");return database.scoped(scope,async tx=>{
  const context=(await tx.query("SELECT role FROM saas.company_context($1)",[tx.companyId])).rows[0];
  if(!context||(context.role!=="Owner"&&context.role!=="Admin"))throw new ApiError(403,"FORBIDDEN","Company administrator role required.");
  const selection=(await tx.query("SELECT company_id::text FROM saas.company_selections WHERE session_id=$1",[tx.sessionId])).rows[0];
  if(!selection||String(selection.company_id).toLowerCase()!==tx.companyId)throw new ApiError(403,"FORBIDDEN","Select this company before initializing reviews.");
  const rows=(await tx.query("SELECT document_id::text FROM invoice_routing.initialize_module_reviews($1,$2)",[tx.companyId,module])).rows;
  const documentIds=rows.map(row=>uuid(String(row.document_id)).toLowerCase());
  for(const documentId of documentIds)await businessAudit(tx,`document.${module}-review-initialized`,documentId);
  return {companyId:tx.companyId,module,insertedCount:documentIds.length,documentIds};
 });},
 list(scope:CompanyScope,moduleValue:unknown){const module=reviewModule(moduleValue);if(scope.permission!==modulePermission(module))throw new ApiError(403,"FORBIDDEN","Module review permission required.");return database.scoped(scope,async tx=>{
   const writePermission=modulePermission(module,true);
  const rows=(await tx.query(`SELECT d.id::text,d.original_name,d.mime_type,d.state AS document_state,d.created_at,p.purpose,r.state AS review_state,r.version::text AS version,r.updated_at AS reviewed_at,(saas.authorized_company(r.company_id,$3) AND d.state IN('quarantined','clean')) AS can_write
   FROM invoice_routing.module_reviews r JOIN saas.documents d ON d.company_id=r.company_id AND d.id=r.document_id
   JOIN invoice_routing.purposes p ON p.company_id=r.company_id AND p.document_id=r.document_id
   WHERE r.company_id=$1 AND r.module=$2 AND r.state<>'withdrawn'
   AND (($2='vat' AND p.purpose IN('vat','both')) OR ($2='ors' AND p.purpose IN('ors','both')))
   ORDER BY CASE r.state WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,d.created_at DESC,d.id DESC LIMIT 100`,[tx.companyId,module,writePermission])).rows;
  return {items:rows};
 });},
 transition(scope:CompanyScope,documentValue:string,moduleValue:unknown,stateValue:unknown,expected:number){const module=reviewModule(moduleValue),state=reviewState(stateValue);if(scope.permission!==modulePermission(module,true))throw new ApiError(403,"FORBIDDEN","Module review write permission required.");const id=uuid(documentValue);
  if(!Number.isSafeInteger(expected)||expected<1)throw new ApiError(400,"INVALID_REQUEST","A valid review version is required.");
  return database.scoped(scope,async tx=>{
   const current=(await tx.query("SELECT r.state,r.version::text AS version FROM invoice_routing.module_reviews r JOIN invoice_routing.purposes p ON p.company_id=r.company_id AND p.document_id=r.document_id JOIN saas.documents d ON d.company_id=r.company_id AND d.id=r.document_id WHERE r.company_id=$1 AND r.document_id=$2 AND r.module=$3 AND r.state<>'withdrawn' AND d.state IN('quarantined','clean') AND (($3='vat' AND p.purpose IN('vat','both')) OR ($3='ors' AND p.purpose IN('ors','both'))) FOR UPDATE OF r",[tx.companyId,id,module])).rows[0];
   if(!current)throw new ApiError(404,"INVALID_REQUEST","Routed document review is unavailable.");
   if(current.state===state)return {documentId:id,module,state,version:Number(current.version),unchanged:true};
   if(Number(current.version)!==expected)invoiceConflict("The review changed. Refresh the queue and try again.");
   const row=(await tx.query("UPDATE invoice_routing.module_reviews SET state=$4,version=version+1,updated_by=$5 WHERE company_id=$1 AND document_id=$2 AND module=$3 AND version=$6 RETURNING state,version::text AS version,updated_at AS reviewed_at",[tx.companyId,id,module,state,tx.actorId,expected])).rows[0];
   if(!row)invoiceConflict("The review changed. Refresh the queue and try again.");
   await businessAudit(tx,`document.${module}-review-${state}`,id);
   return {documentId:id,module,state:row.state,version:Number(row.version),reviewedAt:row.reviewed_at,unchanged:false};
  });
 }
};}

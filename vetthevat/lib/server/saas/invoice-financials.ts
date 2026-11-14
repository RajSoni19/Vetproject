import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {businessAudit,businessCommand} from "@/lib/server/saas/invoices";
import {vatPeriod} from "@/lib/server/saas/vat";
import {mutationKey,versionNumber} from "@/lib/server/saas/invoice-contracts";
import type {CompanyDatabase,CompanyScope,CompanyTransaction} from "@/lib/server/saas/transactions";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";

const methods=["card","bank-transfer","cash","other"] as const;
const treatments=["unknown","standard","zero-rated","exempt","outside-scope","mixed","inclusive"] as const;
const schemes=["invoice","cash"] as const;
const claims=["review-required","eligible","ineligible"] as const;
function unavailable():never{throw new ApiError(503,"UNAVAILABLE","Payment and VAT evidence storage is awaiting its reviewed schema approval.");}
function amount(value:unknown,allowZero=false){
 if(typeof value!=="string"||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value))throw new ApiError(400,"INVALID_REQUEST","Enter a valid amount with at most two decimal places.");
 const [whole,fraction=""]=value.split("."),minor=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,"0"));
 if(!allowZero&&minor===BigInt(0)||minor>BigInt("99999999999999"))throw new ApiError(400,"INVALID_REQUEST","Amount is outside the supported range.");
 return `${minor/BigInt(100)}.${String(minor%BigInt(100)).padStart(2,"0")}`;
}
function shortText(value:unknown,max:number){
 if(value===undefined||value===null||value==="")return null;
 if(typeof value!=="string"||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new ApiError(400,"INVALID_REQUEST","Invalid text field.");
 const normalized=value.normalize("NFKC").trim();if(normalized.length>max)throw new ApiError(400,"INVALID_REQUEST","Text field exceeds its limit.");return normalized||null;
}
function paymentInput(value:unknown){
 const row=objectBody(value,["amount","method","paidOn","transactionReference","notes","evidenceVerified"]);
 if(!(methods as readonly unknown[]).includes(row.method))throw new ApiError(400,"INVALID_REQUEST","Choose a supported manual payment method.");
 if(typeof row.paidOn!=="string"||vatPeriod({startsOn:row.paidOn,endsOn:row.paidOn,currency:"GBP"}).startsOn!==row.paidOn)throw new ApiError(400,"INVALID_REQUEST","Enter a valid payment date.");
 if(row.evidenceVerified!==undefined&&typeof row.evidenceVerified!=="boolean")throw new ApiError(400,"INVALID_REQUEST","Payment evidence review must be explicitly selected.");
 const reference=shortText(row.transactionReference,200),verified=row.evidenceVerified===true;
 if(verified&&!reference)throw new ApiError(400,"INVALID_REQUEST","Add a source reference before marking payment evidence reviewed.");
 return {amount:amount(row.amount),method:row.method as typeof methods[number],paidOn:row.paidOn,transactionReference:reference,notes:shortText(row.notes,2000),evidenceVerified:verified};
}
function taxReviewInput(value:unknown){
 const row=objectBody(value,["evidencedVat","evidenceReference","evidenceVerified","claimStatus","taxTreatment","accountingScheme","version"]);
 const evidencedVat=row.evidencedVat===null||row.evidencedVat===""?null:amount(row.evidencedVat,true),evidenceReference=shortText(row.evidenceReference,500);
 if(typeof row.evidenceVerified!=="boolean"||!(claims as readonly unknown[]).includes(row.claimStatus)||!(treatments as readonly unknown[]).includes(row.taxTreatment)||!(schemes as readonly unknown[]).includes(row.accountingScheme))throw new ApiError(400,"INVALID_REQUEST","Choose a valid evidence, claim and accounting review status.");
 if(row.evidenceVerified&&(!evidencedVat||!evidenceReference))throw new ApiError(400,"INVALID_REQUEST","Verified VAT evidence requires a stated amount and a reference to the original.");
 if(row.claimStatus==="eligible"&&(!row.evidenceVerified||!evidencedVat||minor(evidencedVat)===BigInt(0)||["unknown","zero-rated","exempt","outside-scope"].includes(String(row.taxTreatment))))throw new ApiError(400,"INVALID_REQUEST","Claim eligibility requires verified VAT evidence and a potentially taxable treatment.");
 return {evidencedVat,evidenceReference,evidenceVerified:row.evidenceVerified,claimStatus:row.claimStatus as typeof claims[number],taxTreatment:row.taxTreatment as typeof treatments[number],accountingScheme:row.accountingScheme as typeof schemes[number],version:row.version===undefined?null:versionNumber(row.version)};
}
function minor(value:string){if(!/^-?\d+\.\d{2}$/.test(value))throw new ApiError(503,"UNAVAILABLE","Invoice payment balance is invalid.");return BigInt(value.replace(".",""));}
export function paymentStatus(gross:string,paid:string){
 const g=minor(gross),p=minor(paid);if(g<=BigInt(0))return "not-applicable";
 if(p===BigInt(0))return "unpaid-due";if(p<g)return "partially-paid";if(p===g)return "fully-paid";
 throw new ApiError(503,"UNAVAILABLE","Invoice payment total exceeds its gross amount.");
}
function money(value:bigint){const n=value<BigInt(0)?-value:value;return `${value<BigInt(0)?"-":""}${n/BigInt(100)}.${String(n%BigInt(100)).padStart(2,"0")}`;}
async function ready(tx:CompanyTransaction){return (await tx.query("SELECT to_regclass('business.invoice_payments') IS NOT NULL AND to_regclass('business.invoice_tax_reviews') IS NOT NULL AND to_regclass('business.invoice_payment_events') IS NOT NULL AND to_regclass('business.invoice_tax_review_events') IS NOT NULL AS ready")).rows[0]?.ready===true;}
async function lockInvoiceFinancials(tx:CompanyTransaction,id:string){
 await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('invoice-financial:'||$1::text||':'||$2::text,832))",[tx.companyId,id]);
}
async function invoiceRow(tx:CompanyTransaction,id:string){
 const soft=invoiceSoftDeleteEnabled(process.env),row=(await tx.query(`SELECT id::text,state,kind,direction,currency,gross::text,vat::text,due_on::text FROM business.invoices WHERE company_id=$1 AND id=$2${soft?" AND deleted_at IS NULL":""}`,[tx.companyId,id])).rows[0];
 if(!row)throw new ApiError(404,"INVALID_REQUEST","Invoice is unavailable.");return row;
}
async function paymentRows(tx:CompanyTransaction,id:string){
 return tx.query("SELECT id::text,amount::text,method,paid_on::text,transaction_reference,notes,evidence_verified,recording_type,version,created_at::text,updated_at::text FROM business.invoice_payments WHERE company_id=$1 AND invoice_id=$2 ORDER BY paid_on,id",[tx.companyId,id]);
}
async function paymentSummary(tx:CompanyTransaction,id:string){
 const invoice=await invoiceRow(tx,id),entries=(await paymentRows(tx,id)).rows;
 let paid=BigInt(0);for(const entry of entries)paid+=minor(String(entry.amount));
 const status=invoice.state==="confirmed"&&invoice.kind==="invoice"?paymentStatus(String(invoice.gross),money(paid)):"not-applicable";
 const applicable=status!=="not-applicable",gross=String(invoice.gross),grossMinor=minor(gross);
 return {ready:true,invoiceId:id,currency:invoice.currency,gross,paid:money(paid),balance:applicable?money(grossMinor-paid):null,status,manualOnly:true,entries};
}
async function detectedVat(tx:CompanyTransaction,id:string){
 const row=(await tx.query(`SELECT r.observations->'extraction'->>'vat' AS detected_vat
  FROM business.invoice_attachments a
  JOIN business.extraction_jobs j ON j.company_id=a.company_id AND j.invoice_id=a.invoice_id AND j.document_id=a.document_id AND j.state='completed'
  JOIN business.extraction_results r ON r.company_id=j.company_id AND r.job_id=j.id
  WHERE a.company_id=$1 AND a.invoice_id=$2 ORDER BY j.created_at DESC,r.page LIMIT 1`,[tx.companyId,id])).rows[0];
 const value=row?.detected_vat;if(typeof value==="string"&&/^(?:0|[1-9]\d{0,11})\.\d{2}$/.test(value))return value;return null;
}
async function taxView(tx:CompanyTransaction,id:string){
 const invoice=await invoiceRow(tx,id),detected=await detectedVat(tx,id),row=(await tx.query("SELECT detected_vat::text,detection_status,evidenced_vat::text,evidence_reference,evidence_verified,claim_status,tax_treatment,accounting_scheme,version,reviewed_by::text,reviewed_at::text,updated_at::text FROM business.invoice_tax_reviews WHERE company_id=$1 AND invoice_id=$2",[tx.companyId,id])).rows[0];
 const review=row??{detected_vat:detected,detection_status:detected?"detected":"not-evidenced",evidenced_vat:null,evidence_reference:null,evidence_verified:false,claim_status:"review-required",tax_treatment:"unknown",accounting_scheme:"invoice",version:0,reviewed_by:null,reviewed_at:null,updated_at:null};
 return {ready:true,invoiceId:id,direction:invoice.direction,invoiceState:invoice.state,
  detectedVat:review.detected_vat??detected,detectionStatus:review.detected_vat?"detected":"not-evidenced",
  vatEvidenceMessage:review.detected_vat?null:"VAT not evidenced — review required",
  evidencedVat:review.evidenced_vat,evidenceReference:review.evidence_reference,evidenceVerified:review.evidence_verified,
  claimStatus:review.claim_status,taxTreatment:review.tax_treatment,accountingScheme:review.accounting_scheme,
  version:review.version,reviewedBy:review.reviewed_by,reviewedAt:review.reviewed_at,updatedAt:review.updated_at};
}
export function invoiceFinancialService(database:CompanyDatabase){
 const scoped=<T>(scope:CompanyScope,permission:"invoices:read"|"invoices:write",work:(tx:CompanyTransaction)=>Promise<T>)=>{
  if(scope.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company invoice permission required.");
  return database.scoped(scope,async tx=>{if(tx.permission!==permission)throw new ApiError(403,"FORBIDDEN","Company invoice permission required.");return work(tx);});
 };
 return {
 async paymentSummary(scope:CompanyScope,idValue:string){
  const id=uuid(idValue).toLowerCase();return scoped(scope,"invoices:read",async tx=>{
   if(!await ready(tx))return {ready:false,invoiceId:id,status:"unavailable",manualOnly:true,entries:[]};
   const summary=await paymentSummary(tx,id),invoice=await invoiceRow(tx,id);return {...summary,dueOn:invoice.due_on};
  });
 },
 async recordPayment(scope:CompanyScope,idValue:string,value:unknown,key:string){
  const id=uuid(idValue).toLowerCase(),input=paymentInput(value),idempotency=mutationKey(key);
  return scoped(scope,"invoices:write",async tx=>{
   if(!await ready(tx))unavailable();
   return businessCommand(tx,"invoice.payment.record",idempotency,{id,input},async()=>{
    await lockInvoiceFinancials(tx,id);const invoice=await invoiceRow(tx,id);if(invoice.state!=="confirmed"||invoice.kind!=="invoice"||minor(String(invoice.gross))<=BigInt(0))throw new ApiError(409,"CONFLICT","Only confirmed positive-value invoices can receive payments.");
    const rows=(await paymentRows(tx,id)).rows;const paid=rows.reduce((sum,row)=>sum+minor(String(row.amount)),BigInt(0));
    if(minor(input.amount)>minor(String(invoice.gross))-paid)throw new ApiError(400,"INVALID_REQUEST","Payment exceeds the remaining invoice balance.");
    const row=(await tx.query(`INSERT INTO business.invoice_payments(company_id,invoice_id,amount,method,paid_on,transaction_reference,notes,evidence_verified,created_by,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     RETURNING id::text,amount::text,method,paid_on::text,transaction_reference,notes,evidence_verified,recording_type,version,created_at::text,updated_at::text`,
     [tx.companyId,id,input.amount,input.method,input.paidOn,input.transactionReference,input.notes,input.evidenceVerified,tx.actorId])).rows[0];
    if(!row)throw new ApiError(503,"UNAVAILABLE","Payment was not recorded.");
    await businessAudit(tx,"invoice.payment.recorded",id);return paymentSummary(tx,id);
   });
  });
 },
 async updatePayment(scope:CompanyScope,idValue:string,paymentValue:string,value:unknown,key:string,expectedVersion:number){
  const id=uuid(idValue).toLowerCase(),paymentId=uuid(paymentValue).toLowerCase(),input=paymentInput(value),idempotency=mutationKey(key),version=versionNumber(expectedVersion);
  return scoped(scope,"invoices:write",async tx=>{
   if(!await ready(tx))unavailable();
   return businessCommand(tx,"invoice.payment.update",idempotency,{id,paymentId,version,input},async()=>{
    await lockInvoiceFinancials(tx,id);const invoice=await invoiceRow(tx,id);if(invoice.state!=="confirmed"||invoice.kind!=="invoice"||minor(String(invoice.gross))<=BigInt(0))throw new ApiError(409,"CONFLICT","Only confirmed positive-value invoices can receive payments.");
    const old=(await tx.query("SELECT amount::text,version FROM business.invoice_payments WHERE company_id=$1 AND invoice_id=$2 AND id=$3 FOR UPDATE",[tx.companyId,id,paymentId])).rows[0];
    if(!old||old.version!==version)throw new ApiError(409,"CONFLICT","Payment changed; refresh and review it.");
    const rows=(await paymentRows(tx,id)).rows,paid=rows.reduce((sum,row)=>sum+minor(String(row.amount)),BigInt(0))-minor(String(old.amount));
    if(minor(input.amount)>minor(String(invoice.gross))-paid)throw new ApiError(400,"INVALID_REQUEST","Payment exceeds the remaining invoice balance.");
    const updated=await tx.query(`UPDATE business.invoice_payments SET amount=$4,method=$5,paid_on=$6,transaction_reference=$7,notes=$8,evidence_verified=$9,version=version+1,updated_by=$10,updated_at=now()
     WHERE company_id=$1 AND invoice_id=$2 AND id=$3 AND version=$11 RETURNING id`,[tx.companyId,id,paymentId,input.amount,input.method,input.paidOn,input.transactionReference,input.notes,input.evidenceVerified,tx.actorId,version]);
    if(!updated.rowCount)throw new ApiError(409,"CONFLICT","Payment changed; refresh and review it.");
    await businessAudit(tx,"invoice.payment.updated",id);return paymentSummary(tx,id);
   });
  });
 },
 async taxReview(scope:CompanyScope,idValue:string){
  const id=uuid(idValue).toLowerCase();return scoped(scope,"invoices:read",async tx=>{
   if(!await ready(tx))return {ready:false,invoiceId:id,detectionStatus:"not-evidenced",detectedVat:null,vatEvidenceMessage:"VAT not evidenced — review required"};
   return taxView(tx,id);
  });
 },
 async saveTaxReview(scope:CompanyScope,idValue:string,value:unknown,key:string){
  const id=uuid(idValue).toLowerCase(),input=taxReviewInput(value),idempotency=mutationKey(key);
  return scoped(scope,"invoices:write",async tx=>{
   if(!await ready(tx))unavailable();
   return businessCommand(tx,"invoice.tax-review.save",idempotency,{id,input},async()=>{
    await lockInvoiceFinancials(tx,id);const invoice=await invoiceRow(tx,id),detected=await detectedVat(tx,id);
    if(input.claimStatus==="eligible"&&(invoice.direction!=="purchase"||!["invoice","credit-note"].includes(String(invoice.kind))))throw new ApiError(400,"INVALID_REQUEST","Only purchase invoices and credit notes can be marked eligible for input VAT.");
    if(input.claimStatus==="eligible"&&invoice.kind==="credit-note"&&input.accountingScheme==="cash")throw new ApiError(400,"INVALID_REQUEST","Cash-basis credit-note adjustments require refund tracking, which is not enabled.");
    const gross=minor(String(invoice.gross)),grossLimit=gross<BigInt(0)?-gross:gross;
    if(input.evidencedVat&&minor(input.evidencedVat)>grossLimit)throw new ApiError(400,"INVALID_REQUEST","Evidenced VAT cannot exceed the invoice gross amount.");
    const existing=(await tx.query("SELECT version FROM business.invoice_tax_reviews WHERE company_id=$1 AND invoice_id=$2 FOR UPDATE",[tx.companyId,id])).rows[0];
    if(existing&&input.version!==existing.version||!existing&&input.version!==null)throw new ApiError(409,"CONFLICT","VAT review changed; refresh and review it.");
    const row=existing
     ?(await tx.query(`UPDATE business.invoice_tax_reviews SET detected_vat=$3,detection_status=$4,evidenced_vat=$5,evidence_reference=$6,evidence_verified=$7,claim_status=$8,tax_treatment=$9,accounting_scheme=$10,version=version+1,reviewed_by=$11,reviewed_at=now(),updated_at=now()
       WHERE company_id=$1 AND invoice_id=$2 AND version=$12 RETURNING invoice_id`,[tx.companyId,id,detected,detected?"detected":"not-evidenced",input.evidencedVat,input.evidenceReference,input.evidenceVerified,input.claimStatus,input.taxTreatment,input.accountingScheme,tx.actorId,input.version])).rows[0]
     :(await tx.query(`INSERT INTO business.invoice_tax_reviews(company_id,invoice_id,detected_vat,detection_status,evidenced_vat,evidence_reference,evidence_verified,claim_status,tax_treatment,accounting_scheme,version,reviewed_by,reviewed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,now()) RETURNING invoice_id`,[tx.companyId,id,detected,detected?"detected":"not-evidenced",input.evidencedVat,input.evidenceReference,input.evidenceVerified,input.claimStatus,input.taxTreatment,input.accountingScheme,tx.actorId])).rows[0];
    if(!row)throw new ApiError(409,"CONFLICT","VAT review changed; refresh and review it.");
    await businessAudit(tx,"invoice.tax-review.saved",id);return taxView(tx,id);
   });
  });
 },
 ready(scope:CompanyScope){return scoped(scope,"invoices:read",ready);}
};}
export function validatePaymentInput(value:unknown){return paymentInput(value);}
export function validateTaxReviewInput(value:unknown){return taxReviewInput(value);}

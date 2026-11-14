import type {Workspace} from "@/lib/workspace";
import {legacyRecordReview} from "@/lib/workspace-bootstrap";
export type LegacySelection={kind:ReturnType<typeof legacyRecordReview>[number]["kind"];id:string;companyId?:string};
export const legacyRecoveryPrefix="vet-the-vat-legacy-review-";
export function legacySelectionKey(row:LegacySelection){return JSON.stringify([row.kind,row.id,row.companyId??null]);}
function matches(row:{id:string;companyId?:string},selection:LegacySelection){return row.id===selection.id&&row.companyId===selection.companyId;}
function checkReferences(workspace:Workspace){
 const company=(id:string|undefined)=>!id||workspace.companies.some(row=>row.id===id);
 const supplier=(id:string|undefined,companyId?:string)=>!id||workspace.suppliers.some(row=>row.id===id&&(!companyId||row.companyId===companyId));
 for(const row of [...workspace.invoices,...workspace.documents,...workspace.suppliers,...(workspace.customers??[]),...workspace.teamMembers,...workspace.tickets,...workspace.notifications,...workspace.auditLog]){
  if(!company("companyId" in row?row.companyId:undefined))throw new Error("A remaining record needs its company. No records were deleted.");
 }
 for(const row of workspace.invoices){
  if(!supplier(row.supplierId,row.companyId))throw new Error("A remaining invoice needs this supplier. Select only unreferenced records or review its links first.");
  if(row.documentId&&!workspace.documents.some(doc=>doc.id===row.documentId))throw new Error("A remaining invoice needs this document. Review both linked records first.");
 }
 for(const row of workspace.documents){
  if(row.associatedInvoiceId&&!workspace.invoices.some(invoice=>invoice.id===row.associatedInvoiceId))throw new Error("A remaining document links to this invoice. Review both linked records first.");
  if(!supplier(row.associatedSupplierId,row.companyId))throw new Error("A remaining document needs this supplier.");
 }
}
export function prepareLegacyDeletion(workspace:Workspace,selections:LegacySelection[]){
 if(!Array.isArray(selections)||!selections.length||selections.length>500)throw new Error("Select between 1 and 500 legacy records to review.");
 const review=new Set(legacyRecordReview(workspace).map(legacySelectionKey));
 const selected=new Set(selections.map(legacySelectionKey));
 if(selected.size!==selections.length||selections.some(row=>!review.has(legacySelectionKey(row))))throw new Error("The selection changed or contains a non-legacy record. Reload the review.");
 if(selections.some(selection=>workspace[selection.kind].filter(row=>matches(row,selection)).length!==1))throw new Error("Duplicate or missing record identities require manual review; no records were deleted.");
 if(selections.some(row=>row.kind==="companies"))throw new Error("Company deletion is excluded. Use the company archive workflow instead.");
 const next={...workspace};
 for(const kind of ["invoices","documents","suppliers","tickets","teamMembers","notifications","auditLog"] as const){
  Object.assign(next,{[kind]:workspace[kind].filter(row=>!selections.some(selection=>selection.kind===kind&&matches(row,selection)))});
 }
 // Do not worsen pre-existing broken links: validate against a clean baseline.
 checkReferences(workspace);checkReferences(next);
 return next;
}
export function restoreLegacySelection(current:Workspace,original:Workspace,selections:LegacySelection[]){
 const next={...current};
 for(const kind of ["invoices","documents","suppliers","tickets","teamMembers","notifications","auditLog"] as const){
  const restoring=original[kind].filter(row=>selections.some(selection=>selection.kind===kind&&matches(row,selection)));
  if(restoring.some(row=>current[kind].some(existing=>existing.id===row.id&&("companyId" in existing?existing.companyId:undefined)===("companyId" in row?row.companyId:undefined))))throw new Error("A record with this identity already exists. Recovery will not overwrite it.");
  Object.assign(next,{[kind]:[...current[kind],...restoring]});
 }
 checkReferences(next);return next;
}

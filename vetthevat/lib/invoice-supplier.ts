import type { Invoice, Supplier } from "@/lib/domain";
import { validateSupplier } from "@/lib/workspace";

// Resolve only reviewed/saved invoice content, never intermediate OCR progress.
// Returned changes are committed together with the invoice by AppStateProvider.
export function resolveInvoiceSupplier(invoice: Invoice, suppliers: Supplier[]) {
  if(invoice.transactionType === "Sale")return {invoice,suppliers};
  const name=invoice.supplierName.trim();
  if(!name)return {invoice,suppliers};
  const scope=suppliers.filter(row=>row.companyId===invoice.companyId);
  if(scope.some(row=>row.id===invoice.supplierId))return {invoice,suppliers};
  const normalizeName=(value:string)=>value.replace(/\s+/g,"").toLowerCase();
  const normalizeVat=(value:string)=>value.replace(/[ .-]/g,"").toUpperCase().replace(/^GB(?=\d{9}$)/,"");
  const vat=normalizeVat(invoice.supplierVatNumber);
  const possible=scope.filter(row=>normalizeName(row.name)===normalizeName(name)||Boolean(vat)&&normalizeVat(row.vatNumber)===vat);
  const matches=possible.filter(row=>normalizeName(row.name)===normalizeName(name)&&(!vat||!row.vatNumber||normalizeVat(row.vatNumber)===vat)&&row.status!=="Archived");
  if(possible.length===1&&matches.length===1)return {invoice:{...invoice,supplierId:matches[0].id},suppliers};
  if(possible.length){
    if(invoice.processingStatus==="Confirmed"||invoice.reviewStatus==="Reviewed")throw new Error("Supplier identity is uncertain or archived. Choose the correct company supplier before confirmation.");
    return {invoice:{...invoice,supplierId:"",reviewStatus:"Needs Review" as const},suppliers};
  }
  // OCR and saving an unreviewed draft must never create supplier profiles.
  // Existing matches may still be linked; creation requires explicit review.
  if(invoice.processingStatus!=="Confirmed"||invoice.reviewStatus!=="Reviewed")return {invoice:{...invoice,supplierId:"",reviewStatus:"Needs Review" as const},suppliers};
  const supplier:Supplier={id:crypto.randomUUID(),companyId:invoice.companyId,name,vatNumber:invoice.supplierVatNumber.trim(),email:"",phone:"",address:"",status:"Review"};
  const issues=validateSupplier(supplier,suppliers);
  if(issues.length){
    if(invoice.processingStatus==="Confirmed"||invoice.reviewStatus==="Reviewed")throw new Error(issues.join(" "));
    return {invoice:{...invoice,supplierId:"",reviewStatus:"Needs Review" as const},suppliers};
  }
  return {invoice:{...invoice,supplierId:supplier.id},suppliers:[...suppliers,supplier]};
}

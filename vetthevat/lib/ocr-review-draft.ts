// Suggestions only. Confirmation and exact VAT arithmetic stay server-side.
type Row=Record<string,unknown>;
const text=(v:unknown,max=200)=>typeof v==='string'&&v.length<=max?v:'';
const decimal=(v:unknown)=>typeof v==='string'&&/^\d{1,12}(?:\.\d{1,4})?$/.test(v)?v:'';
export function ocrReviewDraft(pages:readonly {observations:Row}[]){
 const extractions=pages.map(p=>(p.observations.extraction??p.observations) as Row),unique=(key:string)=>{const values=[...new Set(extractions.map(e=>text(e[key])).filter(Boolean))];return values.length===1?values[0]:'';};
 const vatEvidence=unique('vatEvidence'),detectedVat=unique('vat'),notEvidenced=vatEvidence==='not-evidenced'||!detectedVat;
 const lines=extractions.flatMap(e=>Array.isArray(e.lines)?e.lines as Row[]:[]).slice(0,500).map(l=>{
  const classification=l.taxClassification==='Exempt'?'exempt':l.taxClassification==='Out of scope'?'outside':l.taxClassification==='Zero-rated'?'zero':null;
  const extractedRate=decimal(l.vatRate),treatment=classification??(extractedRate?'standard':notEvidenced?'not-evidenced':'standard');
  return {description:text(l.description,2000),quantity:decimal(l.quantity),unitPrice:decimal(l.unitPrice),discount:'0',rate:treatment==='not-evidenced'?'':extractedRate,treatment,pricing:'exclusive'};
 });
 const issuedOn=unique('invoiceDate'),dueOn=unique('dueDate'),currency=unique('currency');return {number:unique('invoiceNumber'),issuedOn:/^\d{4}-\d\d-\d\d$/.test(issuedOn)?issuedOn:'',dueOn:/^\d{4}-\d\d-\d\d$/.test(dueOn)?dueOn:'',currency:['GBP','EUR','USD'].includes(currency)?currency:'',supplierName:unique('supplierName'),supplierVatNumber:unique('supplierVatNumber'),vatEvidenceStatus:notEvidenced?'not-evidenced':'detected',lines,warnings:[...new Set(['Review every suggested field against the private original before saving or confirming.',...extractions.flatMap(e=>Array.isArray(e.warnings)?e.warnings.filter((v):v is string=>typeof v==='string'):[])])],reviewRequired:true as const};
}

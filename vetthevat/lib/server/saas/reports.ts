import {ApiError,uuid} from "@/lib/server/api-v1";
import {vatPeriod} from "@/lib/server/saas/vat";
import {text} from "@/lib/server/saas/invoice-contracts";
import type {CompanyDatabase,CompanyScope} from "@/lib/server/saas/transactions";
import {invoiceSoftDeleteEnabled} from "@/lib/server/saas/invoice-soft-delete";

export function reportFilters(search:URLSearchParams){
 const allowed=['startsOn','endsOn','currency','direction','status','contactId','query','after','format','paymentStatus','vatStatus'];
 for(const key of search.keys())if(!allowed.includes(key)||search.getAll(key).length!==1)throw new ApiError(400,'INVALID_REQUEST','Invalid report filter.');
 const period=vatPeriod({startsOn:search.get('startsOn'),endsOn:search.get('endsOn'),currency:search.get('currency')}),direction=search.get('direction'),status=search.get('status')??'confirmed',format=search.get('format'),paymentStatus=search.get('paymentStatus'),vatStatus=search.get('vatStatus');
 if(direction!==null&&!['purchase','sale'].includes(direction)||!['draft','confirmed'].includes(status)||format!==null&&!['pdf','xlsx'].includes(format)||format&&search.has('after')||paymentStatus!==null&&!['unpaid-due','partially-paid','fully-paid','not-applicable'].includes(paymentStatus)||vatStatus!==null&&!['review-required','not-evidenced','evidenced','eligible','ineligible'].includes(vatStatus))throw new ApiError(400,'INVALID_REQUEST','Invalid report selection.');
 return {...period,direction,status,format,paymentStatus,vatStatus,contactId:search.has('contactId')?uuid(search.get('contactId')):null,query:text(search.get('query'),200),after:search.has('after')?uuid(search.get('after')).toLowerCase():null};
}
export type ReportRow={id:string;number:string;issued_on:string;due_on:string|null;direction:string;kind:string;state:string;contact:string;currency:string;net:string;vat:string;gross:string;vat_evidenced:string|null;vat_claim_status:string;payment_status:string;payment_method:string|null;amount_paid:string;balance_due:string;original_document_reference:string|null};
export type ReportLineItem={invoice_id:string;invoice_number:string;supplier:string;invoice_date:string;position:number;description:string;quantity:string;unit_price:string;discount:string;treatment:string;rate:string;pricing:string;net:string;vat:string;gross:string};
export type InvoiceReport={filters:ReturnType<typeof reportFilters>;items:ReportRow[];lineItems:ReportLineItem[];count:string;net:string;vat:string;gross:string;after:string|null};
export function reportService(database:CompanyDatabase){return {invoices(scope:CompanyScope,search:URLSearchParams):Promise<InvoiceReport>{
 const liveFilter=invoiceSoftDeleteEnabled(process.env)?" AND deleted_at IS NULL":"";
 const filters=reportFilters(search),exporting=Boolean(filters.format);
 if(scope.permission!==(exporting?'reports:export':'reports:read'))throw new ApiError(403,'FORBIDDEN','Report permission required.');
 if(filters.format==='xlsx'&&filters.status!=='confirmed')throw new ApiError(400,'INVALID_REQUEST','Excel exports include only confirmed, human-reviewed invoices.');
 return database.scoped(scope,async tx=>{
  const financialRequested=filters.paymentStatus!==null||filters.vatStatus!==null;
  const schemaReady=(filters.format==='xlsx'||financialRequested)
   ?(await tx.query("SELECT to_regclass('business.invoice_payments') IS NOT NULL AND to_regclass('business.invoice_tax_reviews') IS NOT NULL AS ready")).rows[0]?.ready===true
   :false;
  if(financialRequested&&!schemaReady)throw new ApiError(503,'UNAVAILABLE','Payment and VAT evidence reports are awaiting the reviewed schema approval.');
  const financial=schemaReady;
  const financialSelect=financial?`,
    i.due_on::text AS due_on,
    -- A verified VAT review wins. Otherwise a confirmed invoice (checked by a person) evidences the
    -- VAT it shows, so its VAT is reported as shown on the invoice, matching the invoice screens.
    CASE WHEN tr.evidence_verified THEN tr.evidenced_vat::text
      WHEN i.state='confirmed' AND i.vat>0 THEN i.vat::text ELSE NULL END AS vat_evidenced,
    CASE WHEN tr.claim_status='eligible' AND tr.evidence_verified THEN 'eligible'
      WHEN tr.claim_status='ineligible' AND tr.evidence_verified THEN 'ineligible'
      WHEN tr.evidence_verified THEN 'evidenced'
      WHEN i.state='confirmed' AND i.vat>0 THEN 'evidenced'
      WHEN tr.detection_status='not-evidenced' OR tr.detection_status IS NULL THEN 'not-evidenced'
      ELSE 'review-required' END AS vat_claim_status,
    CASE WHEN i.state<>'confirmed' OR i.kind<>'invoice' OR i.gross<=0 THEN 'not-applicable'
      WHEN COALESCE(pay.paid,0)=0 THEN 'unpaid-due'
      WHEN pay.paid<i.gross THEN 'partially-paid' ELSE 'fully-paid' END AS payment_status,
    pay.methods AS payment_method,COALESCE(pay.paid,0)::numeric(14,2)::text AS amount_paid,
    (i.gross-COALESCE(pay.paid,0))::numeric(14,2)::text AS balance_due
    `:` ,
    i.due_on::text AS due_on,NULL::text AS vat_evidenced,'review-required'::text AS vat_claim_status,
    'unavailable'::text AS payment_status,NULL::text AS payment_method,NULL::text AS amount_paid,
    NULL::text AS balance_due`;
  const financialJoins=financial?`
   LEFT JOIN business.invoice_tax_reviews tr ON tr.company_id=i.company_id AND tr.invoice_id=i.id
   LEFT JOIN LATERAL (SELECT sum(p.amount) AS paid,string_agg(DISTINCT p.method,', ' ORDER BY p.method) AS methods
    FROM business.invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id) pay ON true`:"";
  const documentSelect=filters.format==='xlsx'?',doc.reference AS original_document_reference':',NULL::text AS original_document_reference';
  const documentJoin=filters.format==='xlsx'?`
   LEFT JOIN LATERAL (SELECT d.id::text||' · '||d.original_name AS reference FROM business.invoice_attachments a
    JOIN saas.documents d ON d.company_id=a.company_id AND d.id=a.document_id
    WHERE a.company_id=i.company_id AND a.invoice_id=i.id ORDER BY d.created_at DESC,d.id LIMIT 1) doc ON true`:"";
  // One SQL snapshot for the full filtered totals and current page. Monetary
  // values remain PostgreSQL decimal strings; no browser totals are accepted.
  const row=(await tx.query(`WITH base AS MATERIALIZED (
   SELECT i.id::text,number,issued_on::text,direction,kind,state,coalesce(contact_snapshot->>'name','') AS contact,currency,net,vat,gross${financialSelect}${documentSelect}
   FROM business.invoices i${financialJoins}${documentJoin} WHERE i.company_id=$1 AND i.issued_on BETWEEN $2::date AND $3::date AND i.currency=$4 AND i.state=$5${liveFilter.replaceAll("deleted_at","i.deleted_at")}
   AND ($6::text IS NULL OR i.direction=$6) AND ($7::uuid IS NULL OR (i.contact_id=$7 AND EXISTS(
    SELECT 1 FROM business.counterparties c WHERE c.company_id=i.company_id AND c.id=i.contact_id AND c.kind='supplier')))
   AND ($8::text IS NULL OR strpos(lower(i.number||' '||coalesce(i.contact_snapshot->>'name','')),lower($8))>0)
  ), filtered AS MATERIALIZED (
   SELECT * FROM base WHERE ($9::text IS NULL OR payment_status=$9) AND ($10::text IS NULL OR vat_claim_status=$10)
  ), page AS (SELECT id,number,issued_on,due_on,direction,kind,state,contact,currency,net::text,vat::text,gross::text,vat_evidenced,vat_claim_status,payment_status,payment_method,amount_paid,balance_due,original_document_reference FROM filtered
   WHERE ($11::text IS NULL OR id>$11) ORDER BY id LIMIT $12)
  SELECT count(*)::text AS count,coalesce(sum(net),0)::numeric(20,2)::text AS net,coalesce(sum(vat),0)::numeric(20,2)::text AS vat,
   coalesce(sum(gross),0)::numeric(20,2)::text AS gross,coalesce((SELECT jsonb_agg(page ORDER BY page.id) FROM page),'[]'::jsonb) AS items FROM filtered`,
   [tx.companyId,filters.startsOn,filters.endsOn,filters.currency,filters.status,filters.direction,filters.contactId,filters.query,filters.paymentStatus,filters.vatStatus,filters.after,exporting?5001:51])).rows[0];
  if(!row||!Array.isArray(row.items)||typeof row.count!=='string'||!/^\d+$/.test(row.count)||['net','vat','gross'].some(k=>typeof row[k]!=='string'||!/^\-?\d+\.\d{2}$/.test(String(row[k]))))throw new ApiError(503,'UNAVAILABLE','Report receipt unavailable.');
  if(exporting&&BigInt(row.count)>BigInt(5000))throw new ApiError(400,'INVALID_REQUEST','Narrow the report to 5,000 records or fewer before exporting.');
  const items=(row.items as ReportRow[]).slice(0,exporting?5000:50);
  let lineItems:ReportLineItem[]=[];
  if(filters.format==='xlsx'&&items.length){
   lineItems=(await tx.query(`SELECT i.id::text AS invoice_id,i.number AS invoice_number,coalesce(i.contact_snapshot->>'name','') AS supplier,
    i.issued_on::text AS invoice_date,l.position,l.description,l.quantity::text,l.unit_price::text,l.discount::text,
    l.treatment,l.rate::text,l.pricing,l.net::text,l.vat::text,l.gross::text
    FROM business.invoices i JOIN business.invoice_lines l ON l.company_id=i.company_id AND l.invoice_id=i.id
    WHERE i.company_id=$1 AND i.id=ANY($2::uuid[]) AND i.state='confirmed'${liveFilter.replaceAll("deleted_at","i.deleted_at")}
    ORDER BY i.id,l.position LIMIT 100001`,[tx.companyId,items.map(item=>item.id)])).rows as ReportLineItem[];
   if(lineItems.length>100000)throw new ApiError(400,'INVALID_REQUEST','Narrow the export to 100,000 invoice line items or fewer.');
  }
  return {filters,items,lineItems,count:row.count,net:String(row.net),vat:String(row.vat),gross:String(row.gross),after:!exporting&&row.items.length>50?items[items.length-1].id:null};
 });
}};}

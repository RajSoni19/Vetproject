// Provider-independent, conservative supplier invoice observations. Null means unknown.
import {parseInvoiceDate} from "@/lib/invoice-rules";
export type SupplierLine={description:string;sku:string|null;quantity:string|null;unit:string|null;unitPrice:string|null;discount:string|null;vatRate:string|null;vatAmount:string|null;lineTotal:string|null;materialId:string|null;poPosition:number|null;evidence:{page:number;row:number;text:string;confidence:number|null}};
export type SupplierExtraction={supplier:string|null;invoiceNumber:string|null;invoiceDate:string|null;dueDate:string|null;currency:string|null;subtotal:string|null;vat:string|null;total:string|null;lines:SupplierLine[];warnings:string[]};
export type OcrPage={page:number;text:string;confidence:number|null};
export const normalizeProduct=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const aliases:Record<string,string>={description:'description',product:'description','product description':'description','product name':'description',item:'description',sku:'sku','product code':'sku','supplier product code':'sku',code:'sku',qty:'quantity',quantity:'quantity',unit:'unit',uom:'unit','unit of measurement':'unit',price:'unitPrice','unit price':'unitPrice',discount:'discount','discount amount':'discount','vat rate':'vatRate','vat %':'vatRate','tax rate':'vatRate','vat amount':'vatAmount','tax amount':'vatAmount',net:'lineTotal','line total':'lineTotal',amount:'lineTotal',total:'lineTotal'};
const numeric=(v:string,scale=4)=>{const s=v.replace(/^(?:GBP|EUR|USD|INR|AED|£|€|\$)\s*/i,'').trim();return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)&&s.replace(/,/g,'').split('.')[0].length<=12&&(s.split('.')[1]?.length??0)<=scale?s.replace(/,/g,''):null;};
export function extractSupplierInvoice(pages:OcrPage[]):SupplierExtraction{
 const result:SupplierExtraction={supplier:null,invoiceNumber:null,invoiceDate:null,dueDate:null,currency:null,subtotal:null,vat:null,total:null,lines:[],warnings:[]};
 const observed=new Map<string,Set<string>>();let columns:string[]=[];
 const header=/^(supplier(?: name)?|from|invoice (?:number|no\.?|#)|invoice date|due date|currency|subtotal|sub-total|net total|vat(?: amount)?|total vat|grand total|invoice total|total payable|total)\s*[:#]?\s+(.+)$/i;
 for(const page of pages){let table=false;for(const [index,text] of page.text.replace(/\r/g,'').split('\n').entries()){
  const row=text.trim();if(!row)continue;
  const h=row.match(header);if(h){const label=h[1].toLowerCase(),key=/^(supplier|from)/.test(label)?'supplier':/^invoice (number|no|#)/.test(label)?'invoiceNumber':label==='invoice date'?'invoiceDate':label==='due date'?'dueDate':label==='currency'?'currency':/^(subtotal|sub-total|net total)$/.test(label)?'subtotal':/^(vat|total vat)/.test(label)?'vat':'total';let value:string|null=h[2].trim();if(['subtotal','vat','total'].includes(key))value=numeric(value);if(key.endsWith('Date'))value=parseInvoiceDate(value??'');if(key==='currency')value=/^[A-Z]{3}$/.test(value??'')?value:null;if(value){if(!observed.has(key))observed.set(key,new Set());observed.get(key)!.add(value);}continue;}
  let cells=row.includes('|')?row.split('|').map(c=>c.trim()):row.split(/\t+|\s{2,}/).map(c=>c.trim());
  if(cells.length===1){
   const labels=Object.keys(aliases).sort((a,b)=>b.length-a.length);let rest=row.toLowerCase(),headerCells:string[]=[];
   while(rest){const label=labels.find(label=>rest===label||rest.startsWith(label+' '));if(!label){headerCells=[];break;}headerCells.push(label);rest=rest.slice(label.length).trim();}
   if(headerCells.length>1)cells=headerCells;
   else if(columns.includes('description')){const tokens=row.split(/\s+/),pos=columns.indexOf('description'),extra=tokens.length-columns.length;if(extra>=0)cells=[...tokens.slice(0,pos),tokens.slice(pos,pos+extra+1).join(' '),...tokens.slice(pos+extra+1)];}
  }
  const mapped=cells.map(c=>aliases[c.toLowerCase()]??'');
  if(mapped.includes('description')&&mapped.includes('quantity')){columns=mapped;table=true;continue;}
  if(/^[-+|\s]+$/.test(row)||/^page\s+\d+/i.test(row))continue;
  // Preserve the established explicit five-column format as well as labelled tables.
  const legacy=!columns.length&&cells.length===5&&numeric(cells[1])!==null;
  if(legacy)columns=['description','quantity','unitPrice','vatRate','lineTotal'];
  if(columns.length===cells.length&&cells.length>1&&(table||legacy||numeric(cells[columns.indexOf('quantity')]??'')!==null)){
   const values:Record<string,string|null>={};columns.forEach((key,i)=>{if(key)values[key]=['description','sku','unit'].includes(key)?cells[i]||null:numeric(key==='vatRate'?cells[i].replace(/%$/,''):cells[i],key==='vatRate'?2:4);});
   if(values.description&&(values.quantity!==null||table)){result.lines.push({description:values.description,sku:values.sku??null,quantity:values.quantity??null,unit:values.unit??null,unitPrice:values.unitPrice??null,discount:values.discount??null,vatRate:values.vatRate??null,vatAmount:values.vatAmount??null,lineTotal:values.lineTotal??null,materialId:null,poPosition:null,evidence:{page:page.page,row:index+1,text,confidence:page.confidence}});continue;}
  }
  result.warnings.push(`Unresolved text on page ${page.page}, row ${index+1}: ${row.slice(0,500)}`);
 }}
 for(const [key,values] of observed){if(values.size===1)(result as unknown as Record<string,unknown>)[key]=[...values][0];else result.warnings.push(`Conflicting ${key} observations.`);}
 if(!result.lines.length)result.warnings.push('No reliable table rows identified. Enter lines from the original.');
 return result;
}
// Fixed-point arithmetic with four decimal places; money rounded half-up to currency scale.
const fixed=(s:string|null)=>s!==null&&/^\d{1,12}(?:\.\d{1,4})?$/.test(s)?BigInt(s.split('.')[0])*BigInt("10000")+BigInt((s.split('.')[1]??'').padEnd(4,'0')):null;
export function supplierInvoiceIssues(invoice:SupplierExtraction){
 const issues:string[]=[];let scale:number;
 try{if(!invoice.currency||!Intl.supportedValuesOf('currency').includes(invoice.currency))throw Error();scale=new Intl.NumberFormat('en',{style:'currency',currency:invoice.currency}).resolvedOptions().maximumFractionDigits!;}catch{scale=2;issues.push('Select a supported ISO currency.');}
 const quantum=BigInt("10")**BigInt(4-scale),round=(n:bigint)=>(n+quantum/BigInt("2"))/quantum*quantum;
 const money=(v:string|null,label:string)=>{const n=fixed(v);if(n===null||n%quantum!==BigInt("0"))issues.push(`${label}: missing amount or invalid currency precision.`);return n;};
 for(const key of ['supplier','invoiceNumber','invoiceDate','dueDate'] as const)if(!invoice[key])issues.push(`Missing ${key}.`);
 for(const key of ['invoiceDate','dueDate'] as const)if(invoice[key]&&parseInvoiceDate(invoice[key]!)!==invoice[key])issues.push(`Invalid ${key}.`);
 if(invoice.invoiceDate&&invoice.dueDate&&invoice.dueDate<invoice.invoiceDate)issues.push('Due date precedes invoice date.');
 let net=BigInt("0"),tax=BigInt("0");if(!invoice.lines.length)issues.push('At least one reviewed line is required.');
 invoice.lines.forEach((line,i)=>{const label=`Line ${i+1}`,q=fixed(line.quantity),p=fixed(line.unitPrice),d=line.discount===null?null:money(line.discount,`${label} discount`),n=money(line.lineTotal,`${label} total`),v=money(line.vatAmount,`${label} VAT`),r=fixed(line.vatRate);
  if(!line.description.trim())issues.push(`${label}: description required.`);
  if(q===null||q===BigInt("0")||p===null)issues.push(`${label}: quantity / unit price needs review.`);
  if(!line.unit)issues.push(`${label}: unit missing.`);
  if(d===null)issues.push(`${label}: discount unknown; explicitly enter zero if none.`);
  if(q!==null&&p!==null&&d!==null){const divisor=BigInt("10000")*quantum,base=(q*p+divisor/BigInt("2"))/divisor*quantum;if(d>base)issues.push(`${label}: discount exceeds amount.`);if(n!==null&&base-d!==n)issues.push(`${label}: quantity × price − discount differs from line total.`);}
  if(r===null||r>BigInt("1000000"))issues.push(`${label}: VAT rate needs review.`);else if(n!==null&&v!==null){const divisor=BigInt("1000000")*quantum;if((n*r+divisor/BigInt("2"))/divisor*quantum!==v)issues.push(`${label}: VAT differs from net × rate.`);}
  if(!line.materialId)issues.push(`${label}: unmatched product retained for review.`);
  if(line.evidence.confidence===null||line.evidence.confidence<85)issues.push(`${label}: uncertain OCR evidence.`);
  net+=n??BigInt("0");tax+=v??BigInt("0");
 });
 const subtotal=money(invoice.subtotal,'Subtotal'),vat=money(invoice.vat,'VAT'),total=money(invoice.total,'Total');
 if(subtotal!==null&&net!==subtotal)issues.push('Sum of line totals differs from subtotal.');
 if(vat!==null&&tax!==vat)issues.push('Sum of line VAT differs from invoice VAT.');
 if(subtotal!==null&&vat!==null&&total!==null&&subtotal+vat!==total)issues.push('Subtotal + VAT differs from grand total.');
 return [...issues,...invoice.warnings];
}
export function supplierPoIssues(lines:SupplierLine[],poLines:{position:number;materialId:string;quantity:string}[]){const issues:string[]=[];
 for(const [i,line] of lines.entries()){const match=poLines.find(p=>Number(p.position)===line.poPosition);if(!match||match.materialId!==line.materialId)issues.push(`Line ${i+1}: select a matching PO line.`);}
 for(const po of poLines){const linked=lines.filter(l=>l.poPosition===Number(po.position));if(linked.length&&(linked.some(l=>fixed(l.quantity)===null)||linked.reduce((sum,l)=>sum+(fixed(l.quantity)??BigInt("0")),BigInt("0"))!==fixed(po.quantity)))issues.push(`PO line ${po.position}: invoice quantity differs from ordered quantity.`);}
 return issues;
}
export function matchSupplierProducts(lines:SupplierLine[],products:{id:string;sku:string;name:string}[],mappings:{supplier_code:string;material_id:string}[]=[]){return lines.map(line=>{const code=line.sku?.normalize('NFKC').toUpperCase();const mapped=mappings.filter(m=>m.supplier_code.normalize('NFKC').toUpperCase()===code);let ids=mapped.length?mapped.map(m=>m.material_id):code?products.filter(p=>p.sku.normalize('NFKC').toUpperCase()===code).map(p=>p.id):[];if(!ids.length)ids=products.filter(p=>normalizeProduct(p.name)===normalizeProduct(line.description)).map(p=>p.id);ids=[...new Set(ids)].filter(id=>products.some(p=>p.id===id));return {...line,materialId:ids.length===1?ids[0]:null};});}

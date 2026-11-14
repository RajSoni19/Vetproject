// Company-only historical evidence. No supplier quotation, FX conversion,
// fuzzy product matching, inventory mutation or cross-company declassification.
import {ApiError,uuid} from "@/lib/server/api-v1";
const scale=BigInt(1000000);
type Fraction={n:bigint;d:bigint};
export type VerifiedPriceLine={
 id:string;invoiceId:string;companyId:string;supplierId:string;productId:string;variant:string;
 invoiceDate:string;currency:'GBP'|'EUR'|'USD';vatBasis:'net'|'gross';deliveryBasis:'attributed'|'excluded';
 packs:string;itemsPerPack:string;contentPerItem:string;unit:'g'|'kg'|'ml'|'l'|'each';
 amountMinor:string;discountMinor:string;deliveryMinor:string;
 reviewed:boolean;productMatch:'verified'|'ambiguous';state:'verified'|'cancelled'|'superseded';taxTreatment?:string;
};
function invalid(message:string):never{throw new ApiError(400,'INVALID_REQUEST',message);}
function decimal(value:string){if(typeof value!=='string'||!/^\d{1,9}(?:\.\d{1,6})?$/.test(value))invalid('A bounded decimal quantity is required.');const [whole,fraction='']=value.split('.');const v=BigInt(whole)*scale+BigInt(fraction.padEnd(6,'0'));if(v<=BigInt(0))invalid('Quantity must be positive.');return v;}
function minor(value:string){if(typeof value!=='string'||!/^\d{1,14}$/.test(value))invalid('Costs must be non-negative integer minor currency units.');return BigInt(value);}
function compare(a:Fraction,b:Fraction){const v=a.n*b.d-b.n*a.d;return v<BigInt(0)?-1:v>BigInt(0)?1:0;}
function add(a:Fraction,b:Fraction):Fraction{const n=a.n*b.d+b.n*a.d,d=a.d*b.d;let x=n,y=d;while(y){const r=x%y;x=y;y=r;}return {n:n/x,d:d/x};}
function formatted(a:Fraction,places=6){const factor=BigInt(10)**BigInt(places),value=(a.n*factor*BigInt(2)+a.d)/(a.d*BigInt(2));return (value/factor).toString()+'.'+(value%factor).toString().padStart(places,'0');}
function day(value:string){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))invalid('An invoice date is required.');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)invalid('Invalid invoice date.');return n;}
export function normalizePrice(line:VerifiedPriceLine){
 for(const id of [line.id,line.invoiceId,line.companyId,line.supplierId,line.productId])uuid(id);
 if(line.reviewed!==true||line.productMatch!=='verified'||line.state!=='verified')invalid('Only reviewed, matched, current invoices qualify.');
 if(typeof line.variant!=='string'||!line.variant.trim()||line.variant.length>200||!['GBP','EUR','USD'].includes(line.currency)||!['net','gross'].includes(line.vatBasis)||!['attributed','excluded'].includes(line.deliveryBasis))invalid('Verified variant and price basis are required.');
 if(!['g','kg','ml','l','each'].includes(line.unit))invalid('Unsupported unit.');
 day(line.invoiceDate);const factor={g:BigInt(1),kg:BigInt(1000),ml:BigInt(1),l:BigInt(1000),each:BigInt(1000)}[line.unit];
 // Quantity denominator retains all input precision; comparison never rounds.
 const quantity={n:decimal(line.packs)*decimal(line.itemsPerPack)*decimal(line.contentPerItem)*factor,d:scale**BigInt(3)*BigInt(1000)};
 if(line.unit==='each'&&[line.packs,line.itemsPerPack,line.contentPerItem].some(v=>decimal(v)%scale!==BigInt(0)))invalid('Individual items require integral counts.');
 const amount=minor(line.amountMinor),discount=minor(line.discountMinor),delivery=minor(line.deliveryMinor);
 if(discount>amount||line.deliveryBasis==='excluded'&&delivery!==BigInt(0))invalid('Discount or delivery attribution is inconsistent.');
 const cost=amount-discount+delivery;
 const baseUnit=line.unit==='g'||line.unit==='kg'?'kg':line.unit==='ml'||line.unit==='l'?'l':'each';
 if(line.taxTreatment!==undefined&&(typeof line.taxTreatment!=='string'||line.taxTreatment.length>80))invalid('Invalid tax comparison group.');
 return {line,quantity,cost,baseUnit,price:{n:cost*quantity.d,d:BigInt(100)*quantity.n},key:JSON.stringify([line.productId,line.variant,baseUnit,line.currency,line.vatBasis,line.deliveryBasis,line.taxTreatment??null])};
}
export function compareCompanyPrices(companyId:string,lines:VerifiedPriceLine[],asOf:string){
 uuid(companyId);if(lines.length>5000)invalid('Narrow the comparison to at most 5000 reviewed lines.');
 const end=day(asOf),start=end-27*86400000,mid=end-13*86400000,seen=new Set<string>(),groups=new Map<string,ReturnType<typeof normalizePrice>[]>();
 for(const line of lines){
  if(line.companyId!==companyId)throw new ApiError(403,'FORBIDDEN','Company-only price evidence required.');
  if(seen.has(line.id))invalid('Duplicate price observation.');seen.add(line.id);
  if(line.state!=='verified')continue;
  const date=day(line.invoiceDate);if(date<start||date>end)continue;
  const normalized=normalizePrice(line),group=groups.get(normalized.key)??[];group.push(normalized);groups.set(normalized.key,group);
 }
 const weighted=(rows:ReturnType<typeof normalizePrice>[])=>{let quantity:Fraction={n:BigInt(0),d:BigInt(1)},cost=BigInt(0);for(const row of rows){quantity=add(quantity,row.quantity);cost+=row.cost;}return {n:cost*quantity.d,d:BigInt(100)*quantity.n};};
 return [...groups.values()].map(rows=>{
  const baseline=weighted(rows),suppliers=[...new Set(rows.map(r=>r.line.supplierId))].map(supplierId=>{
   const observations=rows.filter(r=>r.line.supplierId===supplierId).sort((a,b)=>b.line.invoiceDate.localeCompare(a.line.invoiceDate)||a.line.id.localeCompare(b.line.id)),latest=observations[0],lowest=observations.reduce((a,b)=>compare(a.price,b.price)<=0?a:b),mean=weighted(observations),recent=observations.filter(r=>day(r.line.invoiceDate)>=mid),previous=observations.filter(r=>day(r.line.invoiceDate)<mid),invoices=new Set(observations.map(r=>r.line.invoiceId)).size;
   const saving={n:baseline.n*lowest.price.d-lowest.price.n*baseline.d,d:baseline.d*lowest.price.d},highest=observations.reduce((a,b)=>compare(a.price,b.price)>=0?a:b),range={n:highest.price.n*lowest.price.d-lowest.price.n*highest.price.d,d:highest.price.d*lowest.price.d};
   return {supplierId,latestObservedPrice:formatted(latest.price),latestObservedOn:latest.line.invoiceDate,ageDays:(end-day(latest.line.invoiceDate))/86400000,lowestObservedPrice:formatted(lowest.price),weightedAverage:formatted(mean),observedRange:formatted(range),observations:observations.length,independentInvoices:invoices,trend:!recent.length||!previous.length?'insufficient evidence':compare(weighted(recent),weighted(previous))<0?'down':compare(weighted(recent),weighted(previous))>0?'up':'stable',estimatedSavingPerUnit:formatted({n:saving.n>BigInt(0)?saving.n:BigInt(0),d:saving.d}),confidence:invoices>=3&&end-day(latest.line.invoiceDate)<=7*86400000?'moderate':'limited',lowest};
  });
  suppliers.sort((a,b)=>compare(a.lowest.price,b.lowest.price)||a.supplierId.localeCompare(b.supplierId));
  const first=rows[0];return {productId:first.line.productId,variant:first.line.variant,unit:first.baseUnit,currency:first.line.currency,vatBasis:first.line.vatBasis,deliveryBasis:first.line.deliveryBasis,taxTreatment:first.line.taxTreatment??null,startsOn:new Date(start).toISOString().slice(0,10),endsOn:asOf,baseline:formatted(baseline),lowestSupplierId:suppliers[0].supplierId,suppliers:suppliers.map(({lowest,...result})=>result),explanation:'Lowest reviewed comparable invoice observation in the selected 28 calendar days. Savings use the company quantity-weighted baseline; availability, delivery and minimum orders require supplier confirmation.',disclaimer:'Historical invoice prices are not live supplier quotations.'};
 });
}
export function observationUnitPrice(line:VerifiedPriceLine){return formatted(normalizePrice(line).price);}

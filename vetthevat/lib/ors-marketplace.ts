// Shared decimal arithmetic. Money is rounded half-up per line to currency cents.
export type Offer={id:string;material_id:string;supplier_id:string;unit_code:string;base_unit:string;base_quantity_per_unit:string;unit_price:string;currency:string;vat_rate:string;price_includes_vat:boolean;minimum_order_quantity:string;available_quantity:string|null;availability_state:string;valid_until:string;version:number};
const scale=BigInt(1000000);
export function decimal(value:string):bigint{if(!/^\d{1,14}(?:\.\d{1,6})?$/.test(value))throw Error("Invalid decimal");const [whole,fraction=""]=value.split(".");return BigInt(whole)*scale+BigInt(fraction.padEnd(6,"0"));}
const divide=(a:bigint,b:bigint)=>(a+b/BigInt(2))/b;
export function amount(cents:bigint){return `${cents/BigInt(100)}.${String(cents%BigInt(100)).padStart(2,"0")}`;}
export function currencyAmount(value:string){return amount(divide(decimal(value),BigInt(10000)));}
export function lineAmounts(offer:Offer,quantity:string){
 const grossOrNet=divide(decimal(offer.unit_price)*decimal(quantity),scale*BigInt(10000));
 const rate=decimal(offer.vat_rate),hundred=BigInt(100)*scale;
 const net=offer.price_includes_vat?divide(grossOrNet*hundred,hundred+rate):grossOrNet;
 const vat=offer.price_includes_vat?grossOrNet-net:divide(net*rate,hundred);
 return {subtotal:amount(net),vat:amount(vat),total:amount(net+vat)};
}
export function sumAmounts(lines:{subtotal:string;vat:string;total:string}[]){const sum=(key:"subtotal"|"vat"|"total")=>amount(lines.reduce((n,l)=>n+decimal(l[key])/BigInt(10000),BigInt(0)));return {subtotal:sum("subtotal"),vat:sum("vat"),total:sum("total")};}
export function offerUsable(offer:Offer|undefined,quantity="1",now=Date.now()):boolean{return !!offer&&twoDecimalCurrency(offer.currency)&&Date.parse(offer.valid_until)>now&&offer.availability_state==="available"&&decimal(quantity)>=decimal(offer.minimum_order_quantity)&&offer.available_quantity!==null&&decimal(quantity)<=decimal(offer.available_quantity);}
export function twoDecimalCurrency(currency:string){try{return /^[A-Z]{3}$/.test(currency)&&new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits===2;}catch{return false;}}
// Compare VAT-exclusive amounts per identical base unit within the same currency.
export function compareOffers(a:Offer,b:Offer){const net=(o:Offer)=>({n:decimal(o.unit_price)*(o.price_includes_vat?BigInt(100)*scale:BigInt(1)),d:decimal(o.base_quantity_per_unit)*(o.price_includes_vat?BigInt(100)*scale+decimal(o.vat_rate):BigInt(1))});const x=net(a),y=net(b),difference=x.n*y.d-y.n*x.d;return difference<BigInt(0)?-1:difference>BigInt(0)?1:0;}
export function phoneDigits(phone:string){if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error("Supplier WhatsApp phone must use international format, for example +441234567890.");return phone.slice(1);}
export type MessageLine={name:string;sku:string;quantity:string;unit:string;unitPrice:string;vatRate:string;includesVat:boolean;total:string};
export function whatsappMessage(company:string,supplier:string,reference:string,currency:string,lines:MessageLine[],totals:{subtotal:string;vat:string;total:string}){
 const clean=(s:string)=>s.replace(/[\r\n\t]+/g," ");
 return [`Order request: ${reference}`,`Company: ${clean(company)}`,`Supplier: ${clean(supplier)}`,"",...lines.map((l,i)=>`${i+1}. ${clean(l.name)} (${clean(l.sku)})\n   ${l.quantity} ${l.unit} × ${currency} ${l.unitPrice} / ${l.unit} (${l.includesVat?"incl.":"excl."} VAT ${l.vatRate}%) — ${currency} ${l.total}`),"",`Subtotal (excl. VAT): ${currency} ${totals.subtotal}`,`VAT: ${currency} ${totals.vat}`,`Total: ${currency} ${totals.total}`,"","Please confirm availability, delivery date and acceptance of this order reference.","Draft order request; dispatch and acceptance are pending confirmation."].join("\n");
}

// Exact, deterministic calculation policy. No jurisdiction or tax-rate defaults.
import {ApiError,objectBody} from "@/lib/server/api-v1";

export type Treatment="standard"|"reduced"|"zero"|"exempt"|"outside"|"not-evidenced";
export type VatLine={description:string;quantity:string;unitPrice:string;discount:string;rate:string;treatment:Treatment;pricing:"exclusive"|"inclusive"};
export type VatPolicy={rounding:"line-half-up"|"tax-group-half-up";currency:"GBP"|"EUR"|"USD";kind:"invoice"|"credit-note"};
export function invalidVat(message="Invalid invoice calculation."):never{throw new ApiError(400,"INVALID_REQUEST",message);}
export function decimalUnits(value:unknown,scale:number,maxDigits=12):bigint{
  if(typeof value!=="string"||!new RegExp(`^(0|[1-9][0-9]{0,${maxDigits-1}})(\\.[0-9]{1,${scale}})?$`).test(value))return invalidVat("Use bounded non-negative decimal strings.");
  const [whole,fraction=""]=value.split(".");return BigInt(whole)*BigInt("10")**BigInt(scale)+BigInt(fraction.padEnd(scale,"0"));
}
export function halfUp(n:bigint,d:bigint):bigint{if(d<=BigInt("0"))return invalidVat();return n<BigInt("0")?-halfUp(-n,d):(n+d/BigInt("2"))/d;}
export function money(value:bigint):string{const n=value<BigInt("0")?-value:value;return `${value<BigInt("0")?"-":""}${n/BigInt("100")}.${String(n%BigInt("100")).padStart(2,"0")}`;}
export function vatLine(value:unknown):VatLine{
  const v=objectBody(value,["description","quantity","unitPrice","discount","rate","treatment","pricing"]);
  if(typeof v.description!=="string"||!v.description.trim()||v.description.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.description))return invalidVat("A bounded line description is required.");
  const quantity=decimalUnits(v.quantity,4),price=decimalUnits(v.unitPrice,4),discount=decimalUnits(v.discount,2),rate=decimalUnits(v.rate,4,3);
  if(quantity===BigInt("0")||price>BigInt("9999999999999999")||rate>BigInt("1000000")||!["standard","reduced","zero","exempt","outside","not-evidenced"].includes(String(v.treatment))||!["inclusive","exclusive"].includes(String(v.pricing)))return invalidVat();
  if(v.treatment==="not-evidenced"&&rate!==BigInt("0"))return invalidVat("VAT not evidenced lines cannot carry an inferred rate.");
  if(!["standard","reduced"].includes(String(v.treatment))&&rate!==BigInt("0"))return invalidVat("Non-taxable and zero-rated lines require an explicit zero rate.");
  if(["standard","reduced"].includes(String(v.treatment))&&rate===BigInt("0"))return invalidVat("Taxable lines require an explicit positive rate.");
  if(discount>halfUp(quantity*price,BigInt("1000000")))return invalidVat("Discount exceeds the line amount.");
  return {...v,description:v.description.trim()} as VatLine;
}
export function calculateVat(input:readonly unknown[],policy:VatPolicy){
  if(!Array.isArray(input)||input.length<1||input.length>500||!["GBP","EUR","USD"].includes(policy.currency)||!["invoice","credit-note"].includes(policy.kind)||!["line-half-up","tax-group-half-up"].includes(policy.rounding))return invalidVat();
  const sign=policy.kind==="credit-note"?-BigInt("1"):BigInt("1");
  const work=input.map(value=>{
    const line=vatLine(value),q=decimalUnits(line.quantity,4),p=decimalUnits(line.unitPrice,4),rate=decimalUnits(line.rate,4,3);
    // Quantity x unit price is rounded to currency before the absolute discount.
    const base=halfUp(q*p,BigInt("1000000"))-decimalUnits(line.discount,2);
    const denominator=line.pricing==="inclusive"?BigInt("1000000")+rate:BigInt("1000000");
    const numerator=base*rate;
    return {line,base,numerator,denominator,tax:halfUp(numerator,denominator)};
  });
  if(policy.rounding==="tax-group-half-up"){
    const groups=new Map<string,typeof work>();
    for(const row of work){const key=`${row.line.treatment}/${decimalUnits(row.line.rate,4,3)}/${row.line.pricing}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
    // Largest-remainder allocation, stable input order for ties. Each line is
    // at most one penny away from its exact rational amount; sums reconcile.
    for(const group of groups.values()){
      const total=halfUp(group.reduce((s,r)=>s+r.numerator,BigInt("0")),group[0].denominator);
      for(const row of group)row.tax=row.numerator/row.denominator;
      const order=group.map((row,index)=>({row,index,remainder:row.numerator%row.denominator})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
      const extra=Number(total-group.reduce((s,r)=>s+r.tax,BigInt("0")));for(let i=0;i<extra;i++)order[i].row.tax++;
    }
  }
  let net=BigInt("0"),tax=BigInt("0");
  const lines=work.map(({line,base,tax:vat})=>{const n=line.pricing==="inclusive"?base-vat:base;net+=n;tax+=vat;return {...line,net:money(n*sign),vat:money(vat*sign),gross:money((n+vat)*sign)};});
  if(net+tax>BigInt("99999999999999"))return invalidVat("Invoice exceeds the supported monetary limit.");
  return {policy:{...policy,version:"vtv-vat-1" as const},lines,net:money(net*sign),vat:money(tax*sign),gross:money((net+tax)*sign)};
}
export function vatPeriod(value:unknown,maxDays=366){
  const v=objectBody(value,["startsOn","endsOn","currency"]);
  const valid=(d:unknown)=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>="2000-01-01"&&d<="2199-12-31"&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!Number.isInteger(maxDays)||maxDays<1||maxDays>73050||!valid(v.startsOn)||!valid(v.endsOn)||String(v.startsOn)>String(v.endsOn)||Date.parse(String(v.endsOn))-Date.parse(String(v.startsOn))>maxDays*86400000||!["GBP","EUR","USD"].includes(String(v.currency)))return invalidVat("Select a valid period and one currency.");
  return v as {startsOn:string;endsOn:string;currency:VatPolicy["currency"]};
}

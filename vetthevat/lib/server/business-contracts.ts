import {ApiError,objectBody,uuid,pagination,draftLine} from "@/lib/server/api-v1";
import {parseInvoiceDate} from "@/lib/invoice-rules";
import {createHash} from "node:crypto";
import {validateDocumentSignature} from "@/lib/document-validation";
const invalid=():never=>{throw new ApiError(400,"INVALID_REQUEST","Invalid business request fields.");};
function text(value:unknown,max=200,required=false){if(typeof value!=="string"||value.length>max||required&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))return invalid();return value.trim();}
function choice<T extends string>(value:unknown,choices:readonly T[]):T{if(typeof value!=="string"||!choices.includes(value as T))return invalid();return value as T;}
function date(value:unknown,optional=false){if(optional&&(value===null||value===undefined||value===""))return null;if(typeof value!=="string"||value!==parseInvoiceDate(value))return invalid();return value;}
function optionalId(value:unknown){return value===null||value===undefined?null:uuid(value);}
export function contactCommand(value:unknown){
  const row=objectBody(value,["name","email","phone","vatNumber","address","status"]);
  const email=text(row.email??"",254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return invalid();
  return {name:text(row.name,200,true),email,phone:text(row.phone??"",50),vatNumber:text(row.vatNumber??"",25),address:text(row.address??"",2000),status:choice(row.status,["Active","Review","Archived"])};
}
export function companyCommand(value:unknown){
  const row=objectBody(value,["name","registrationNumber","vatNumber","address","country","currency","industry","vatPeriodStart","vatPeriodEnd"]);
  const start=date(row.vatPeriodStart,true),end=date(row.vatPeriodEnd,true);if(start&&end&&start>end)return invalid();
  return {name:text(row.name,200,true),registrationNumber:text(row.registrationNumber??"",30),vatNumber:text(row.vatNumber??"",25),address:text(row.address??"",2000),country:text(row.country,100,true),currency:choice(row.currency,["GBP","EUR","USD"]),industry:text(row.industry??"",200),vatPeriodStart:start,vatPeriodEnd:end};
}
function scaled(value:string,places:number){const [whole,fraction=""]=value.split(".");return BigInt(whole)*BigInt(10**places)+BigInt(fraction.padEnd(places,"0"));}
const money=(minor:bigint)=>`${minor/BigInt(100)}.${(minor%BigInt(100)).toString().padStart(2,"0")}`;
export function financialLine(value:unknown,allowIncomplete=false){
  const row=draftLine(value);
  if(![row.quantity,row.unitPrice,row.discount,row.vatRate].every(value=>/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)))return invalid();
  const quantity=scaled(row.quantity,4),price=scaled(row.unitPrice,4),discount=scaled(row.discount,2),rate=scaled(row.vatRate,2);
  if(quantity<BigInt(0)||!allowIncomplete&&quantity===BigInt(0)||quantity>BigInt("1000000000000")||price>BigInt("1000000000000")||rate>BigInt(10000)||discount*BigInt(1000000)>quantity*price)return invalid();
  // Same existing policy: rounded line net less line discount, then rounded VAT.
  const net=(quantity*price+BigInt(500000))/BigInt(1000000)-discount;
  const vat=(net*rate+BigInt(5000))/BigInt(10000);
  if(net+vat>BigInt("100000000000000"))return invalid();
  if(row.taxClassification&&row.taxClassification!=="Taxable"&&rate!==BigInt(0))return invalid();
  return {...row,net:money(net),vat:money(vat),gross:money(net+vat)};
}
export function invoiceCommand(value:unknown){
  const row=objectBody(value,["id","supplierId","customerId","documentId","invoiceNumber","invoiceDate","dueDate","currency","supplierName","supplierVatNumber","customerName","customerVatNumber","transactionType","lines","action","notes"]);
  const action=choice(row.action,["save-draft","confirm"]),invoiceDate=date(row.invoiceDate,action==="save-draft"),dueDate=date(row.dueDate,true);
  if(invoiceDate&&dueDate&&dueDate<invoiceDate||!Array.isArray(row.lines)||row.lines.length>500||action==="confirm"&&!row.lines.length)return invalid();
  const lines=row.lines.map(value=>financialLine(value,action==="save-draft"));if(new Set(lines.map(line=>line.id)).size!==lines.length||action==="confirm"&&lines.some(line=>!line.description.trim()))return invalid();
  const net=lines.reduce((sum,line)=>sum+scaled(line.net,2),BigInt(0)),vat=lines.reduce((sum,line)=>sum+scaled(line.vat,2),BigInt(0));
  if(net+vat>BigInt("100000000000000")||action==="confirm"&&net+vat<=BigInt(0))return invalid();
  const direction=row.transactionType==null?null:choice(row.transactionType,["Purchase","Sale"]);
  if(row.customerId!=null&&direction!=="Sale")return invalid();
  return {id:uuid(row.id),supplierId:optionalId(row.supplierId),customerId:optionalId(row.customerId),documentId:optionalId(row.documentId),invoiceNumber:text(row.invoiceNumber??"",200,action==="confirm"),invoiceDate,dueDate,currency:choice(row.currency,["GBP","EUR","USD"]),supplierName:text(row.supplierName??"",200,action==="confirm"),supplierVatNumber:text(row.supplierVatNumber??"",25),customerName:text(row.customerName??"",200,action==="confirm"&&direction==="Sale"),customerVatNumber:text(row.customerVatNumber??"",25),transactionType:direction,lines,net:money(net),vat:money(vat),gross:money(net+vat),action,notes:text(row.notes??"",5000)};
}
export function scopedFilters(search:URLSearchParams){
  const allowed=["limit","cursor","query","dateFrom","dateTo","currency","direction","status","supplierId","customerId"];
  for(const key of search.keys())if(!allowed.includes(key)||search.getAll(key).length!==1)return invalid();
  const from=date(search.get("dateFrom"),true),to=date(search.get("dateTo"),true);if(from&&to&&from>to)return invalid();
  return {...pagination(search),query:text(search.get("query")??"",200),dateFrom:from,dateTo:to,currency:search.has("currency")?choice(search.get("currency"),["GBP","EUR","USD"]):null,direction:search.has("direction")?choice(search.get("direction"),["Purchase","Sale","Unclassified"]):null,status:search.has("status")?choice(search.get("status"),["Draft","Reviewed","Pending Review","Processed","Duplicate Warning","Processing Failed"]):null,supplierId:optionalId(search.get("supplierId")),customerId:optionalId(search.get("customerId"))};
}
export function reportCommand(value:unknown){
  const row=objectBody(value,["format","query","approval","vatRate"]);
  const query=text(row.query??"",2000),format=choice(row.format,["xlsx","pdf"]),approval=choice(row.approval??"All",["All","Reviewed","Needs Review"]);
  if(row.vatRate!==undefined&&(typeof row.vatRate!=="string"||!/^\d{1,3}(?:\.\d{1,2})?$/.test(row.vatRate)||Number(row.vatRate)>100))return invalid();
  return {format,approval,vatRate:row.vatRate??null,filters:scopedFilters(new URLSearchParams(query))};
}
export function uploadIntent(value:unknown){
  const row=objectBody(value,["originalName","mimeType","byteSize","sha256","purpose"]),purpose=choice(row.purpose,["invoice"]);
  const types=["application/pdf","image/jpeg","image/png","image/webp"];
  const mimeType=choice(row.mimeType,types),name=text(row.originalName,200,true);
  if(/[\\/]/.test(name)||!Number.isSafeInteger(row.byteSize)||Number(row.byteSize)<1||Number(row.byteSize)>10*1024*1024||typeof row.sha256!=="string"||!/^[a-f0-9]{64}$/.test(row.sha256))return invalid();
  return {originalName:name,mimeType,byteSize:Number(row.byteSize),sha256:row.sha256,purpose};
}
export function verifyOriginalBytes(intent:ReturnType<typeof uploadIntent>,bytes:Uint8Array){
  if(bytes.byteLength!==intent.byteSize||createHash("sha256").update(bytes).digest("hex")!==intent.sha256)return invalid();
  try{validateDocumentSignature(intent.mimeType,bytes.byteLength,bytes);}catch{return invalid();}
  return {sha256:intent.sha256,byteSize:bytes.byteLength};
}
export type PrivateOriginal={id:string;companyId:string;objectVersion:string;byteSize:number;sha256:string;status:"pending"|"quarantined"|"available"|"missing"};
export interface PrivateStoragePort {
  stage(input:{companyId:string;documentId:string;mimeType:string;bytes:Uint8Array;sha256:string}):Promise<{opaqueObjectId:string;objectVersion:string}>;
  inspect(opaqueObjectId:string,objectVersion:string):Promise<{byteSize:number;sha256:string;malware:"clean"|"pending"|"rejected"}>;
  // Authorize read capability before issuing a short-lived access URL. Never
  // accept an object key/URL from clients or return bucket credentials.
  authorizeDownload(input:{companyId:string;documentId:string;userId:string}):Promise<{url:string;expiresAt:string}>;
}

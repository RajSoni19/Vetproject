import {createHash} from "node:crypto";
import {ApiError,objectBody,uuid} from "@/lib/server/api-v1";
import {calculateVat,vatPeriod,type VatPolicy} from "@/lib/server/saas/vat";

export function text(value:unknown,max:number,required=false):string|null{
  if(value===null||value===undefined||value===""){if(required)throw new ApiError(400,"INVALID_REQUEST","A required text field is missing.");return null;}
  if(typeof value!=="string"||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new ApiError(400,"INVALID_REQUEST","Invalid text field.");
  const normalized=value.normalize("NFKC").trim();if(normalized.length>max)throw new ApiError(400,"INVALID_REQUEST","Normalized text exceeds the field limit.");if(required&&!normalized)throw new ApiError(400,"INVALID_REQUEST","A required text field is missing.");return normalized||null;
}
export function contactInput(value:unknown){
  const v=objectBody(value,["kind","name","email","phone","vatNumber","address","status"]);
  if(!["supplier","customer"].includes(String(v.kind))||!["active","archived"].includes(String(v.status)))throw new ApiError(400,"INVALID_REQUEST","Invalid contact classification.");
  const email=text(v.email,254);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,"INVALID_REQUEST","Invalid contact email.");
  return {kind:v.kind as "supplier"|"customer",name:text(v.name,200,true)!,email:email?.toLowerCase()??null,phone:text(v.phone,50),vatNumber:text(v.vatNumber,50),address:text(v.address,2000),status:v.status as "active"|"archived"};
}
export function invoiceInput(value:unknown){
  const v=objectBody(value,["direction","kind","contactId","number","issuedOn","dueOn","currency","rounding","lines","notes","creditForId"]);
  if(!["purchase","sale"].includes(String(v.direction))||!["invoice","credit-note"].includes(String(v.kind)))throw new ApiError(400,"INVALID_REQUEST","Invoice direction and kind are required.");
  const day=(d:unknown)=>vatPeriod({startsOn:d,endsOn:d,currency:v.currency}).startsOn;
  const issuedOn=day(v.issuedOn),dueOn=v.dueOn===null||v.dueOn===undefined?null:day(v.dueOn);
  if(dueOn&&dueOn<issuedOn)throw new ApiError(400,"INVALID_REQUEST","Due date precedes invoice date.");
  const creditForId=v.creditForId==null?null:uuid(v.creditForId).toLowerCase();
  if((v.kind==="credit-note")!==Boolean(creditForId))throw new ApiError(400,"INVALID_REQUEST","Credit notes require their original invoice reference.");
  if(!Array.isArray(v.lines))throw new ApiError(400,"INVALID_REQUEST","Invoice lines required.");
  const calculation=calculateVat(v.lines,{currency:v.currency,kind:v.kind,rounding:v.rounding} as VatPolicy);
  const number=text(v.number,100,true)!;
  if(!number.toUpperCase().replace(/[^\p{L}\p{N}]/gu,""))throw new ApiError(400,"INVALID_REQUEST","Invoice number must contain a letter or digit.");
  return {direction:v.direction as "purchase"|"sale",kind:v.kind as VatPolicy["kind"],contactId:uuid(v.contactId).toLowerCase(),number,numberKey:number.toUpperCase().replace(/[^\p{L}\p{N}]/gu,""),issuedOn,dueOn,creditForId,notes:text(v.notes,4000),calculation};
}
export function mutationKey(key:unknown){if(typeof key!=="string"||!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new ApiError(400,"INVALID_REQUEST","A valid idempotency key is required.");return key;}
export function versionNumber(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<1||Number(value)>999999999)throw new ApiError(400,"INVALID_REQUEST","A valid record version is required.");return Number(value);}
export function digest(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
export function listInput(search:URLSearchParams,target:"invoices"|"contacts"="invoices"){
  const allowed=target==="invoices"?["limit","after","query","direction","status","contactId"]:["limit","after","query","kind"];
  for(const key of search.keys())if(!allowed.includes(key)||search.getAll(key).length!==1)throw new ApiError(400,"INVALID_REQUEST","Invalid filter.");
  const limit=search.get("limit")??"25";if(!/^(?:[1-9][0-9]?|100)$/.test(limit))throw new ApiError(400,"INVALID_REQUEST","Invalid limit.");
  const filter=(key:string,values:string[])=>{const v=search.get(key);if(v!==null&&!values.includes(v))throw new ApiError(400,"INVALID_REQUEST","Invalid filter.");return v;};
  return {limit:Number(limit),after:search.has("after")?uuid(search.get("after")).toLowerCase():null,query:text(search.get("query"),200),direction:filter("direction",["purchase","sale"]),status:filter("status",["draft","confirmed"]),kind:filter("kind",["supplier","customer"]),contactId:search.has("contactId")?uuid(search.get("contactId")).toLowerCase():null};
}

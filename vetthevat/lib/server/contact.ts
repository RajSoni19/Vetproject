import {localUat} from "@/lib/server/local-uat";
import {configuredContactRuntime} from "@/lib/server/contact-runtime";
import {createHmac,randomUUID} from "node:crypto";
import {validateContact,ContactValidationError} from "@/lib/contact-contracts";
import {boundedJson,LeadError} from "@/lib/server/leads/core";
export type ContactInput=ReturnType<typeof validateContact>;
export interface ContactStore {
 consume(key:string,limit:number,seconds:number):Promise<{allowed:boolean;retryAfter:number}>;
 save(input:{payload:ContactInput;keyHash:string;digest:string;duplicateHash:string}):Promise<{id:string;createdAt:string}>;
}
export type ContactServices={origin:string;secret:string;store:ContactStore;verifyBot(token:string,requestId:string):Promise<boolean>;networkKey(request:Request):string;allowOrigin?(request:Request):boolean};
export function contactHandler(services:ContactServices|undefined){return async(request:Request)=>{
 const requestId=randomUUID(),headers={"cache-control":"no-store","x-request-id":requestId};
 try{
  if(request.method!=="POST")return new Response(null,{status:405,headers:{...headers,allow:"POST"}});
  if(!services||services.secret.length<32)throw new LeadError(503,"UNAVAILABLE","Online enquiries are not available yet. No message has been saved.");
  if(services.allowOrigin?!services.allowOrigin(request):(request.headers.get("origin")!==services.origin||new URL(request.url).origin!==services.origin||request.headers.get("sec-fetch-site")==="cross-site"))throw new LeadError(403,"FORBIDDEN","Submit the form from this website.");
  const hash=(purpose:string,value:string)=>createHmac("sha256",services.secret).update(`${purpose}:${value}`).digest("hex");
  for(const [key,limit,seconds]of [["global",120,60],[`network:${hash("network",services.networkKey(request))}`,10,3600]] as const){const rate=await services.store.consume(key,limit,seconds);if(!rate.allowed)throw new LeadError(429,"RATE_LIMITED","Too many enquiries. Please try again later.",rate.retryAfter);}
  const body=await boundedJson(request);if(!body||typeof body!=="object"||Array.isArray(body))throw new LeadError(400,"INVALID_REQUEST","Invalid enquiry.");
  const {website,turnstileToken,...fields}=body as Record<string,unknown>;
  if(website!==""||typeof turnstileToken!=="string"||!turnstileToken||turnstileToken.length>2048)throw new LeadError(400,"BOT_CHECK_FAILED","Complete the security check.");
  const payload=validateContact(fields),key=request.headers.get("idempotency-key")??"";
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key))throw new LeadError(400,"INVALID_REQUEST","Refresh the form and try again.");
  if(!await services.verifyBot(turnstileToken,requestId))throw new LeadError(400,"BOT_CHECK_FAILED","The security check expired or failed.");
  const rate=await services.store.consume(`email:${hash("email",payload.email)}`,5,3600);if(!rate.allowed)throw new LeadError(429,"RATE_LIMITED","Too many enquiries. Please try again later.",rate.retryAfter);
  const saved=await services.store.save({payload,keyHash:hash("idempotency",key),digest:hash("payload",JSON.stringify(payload)),duplicateHash:hash("duplicate",new Date().toISOString().slice(0,10)+JSON.stringify(payload))});
  if(!/^[a-f0-9-]{36}$/.test(saved.id)||!Number.isFinite(Date.parse(saved.createdAt)))throw Error("Invalid durable receipt");
  return Response.json({received:true,reference:saved.id,message:"Thank you. Your enquiry has been received."},{headers});
 }catch(error){const known=error instanceof LeadError,validation=error instanceof ContactValidationError;return Response.json({error:{code:validation?"VALIDATION":known?error.code:"UNAVAILABLE",message:validation?error.message:known?error.message:"Your enquiry could not be confirmed. Retry with the same form.",...(validation?{fields:error.fields}:{})}},{status:validation?400:known?error.status:503,headers:{...headers,...(known&&error.retryAfter?{"retry-after":String(error.retryAfter)}:{})}});}
};}
// The approved contact schema is still unusable without a dedicated credential,
// exact isolated target and verified bot configuration. No outbound mail here.
export function contactRuntime():ContactServices|undefined{
 if(process.env.CONTACT_ENABLED!=='1'&&!localUat(process.env))return undefined;
  return configuredContactRuntime();
}

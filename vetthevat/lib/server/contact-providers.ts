import {turnstileVerifier,escapeLeadHtml} from "@/lib/server/leads/providers";
import type {ContactInput} from "@/lib/server/contact";
export function contactBotVerifier(secret:string,hostname:string,fetcher:typeof fetch=fetch){return turnstileVerifier(secret,hostname,fetcher,"contact-enquiry");}
export function contactEmail(payload:ContactInput,id:string,createdAt:string,verifiedSender:string){
 const fields=[["Reference",id],["Submitted",createdAt],["Full name",payload.fullName],["Business name",payload.businessName],["Email",payload.email],["Category",payload.category],["Message",payload.message]];
 return {from:verifiedSender,to:["admin@vetthevat.com"],subject:`VET THE VAT contact enquiry ${id}`,text:fields.map(([k,v])=>`${k}: ${v}`).join('\n'),html:`<h1>Contact enquiry</h1><dl>${fields.map(([k,v])=>`<dt>${escapeLeadHtml(k)}</dt><dd style="white-space:pre-wrap">${escapeLeadHtml(v)}</dd>`).join('')}</dl>`};
}

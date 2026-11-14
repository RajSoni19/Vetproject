import {ApiError,uuid} from "@/lib/server/api-v1";
import {validateContact} from "@/lib/contact-contracts";
import {contactEmail} from "@/lib/server/contact-providers";
import type {smtpMailer} from "@/lib/server/providers/smtp";
export type ContactNotice={id:string;lease:string;enquiryId:string;payload:unknown;createdAt:string};
export interface ContactNotificationStore{claim():Promise<ContactNotice|null>;finish(job:ContactNotice,providerId:string|null,failed:boolean):Promise<boolean>;}
export async function processContactNotice(store:ContactNotificationStore,mailer:ReturnType<typeof smtpMailer>,recipient:string,signal:AbortSignal){
 signal.throwIfAborted();const job=await store.claim();if(!job)return {state:'idle'};
 uuid(job.id);uuid(job.lease);uuid(job.enquiryId);signal.throwIfAborted();let providerId:string;
 try{const payload=validateContact(job.payload);if(!Number.isFinite(Date.parse(job.createdAt)))throw Error();const message=contactEmail(payload,job.enquiryId,job.createdAt,'');const result=await mailer.send({to:recipient,subject:message.subject,text:message.text,html:message.html,reference:'contact/'+job.id});if(result.accepted!==true||!result.messageId)throw Error();providerId=result.messageId;}
 catch{if(!await store.finish(job,null,true))throw new ApiError(409,'CONFLICT','Contact notification lease expired.');return {state:'retry_or_review'};}
 // SMTP acceptance and its database acknowledgement are separate outcomes.
 // An unknown commit must preserve the lease, never call the send-failure path.
 if(!await store.finish(job,providerId,false))throw new ApiError(409,'CONFLICT','Contact notification acknowledgement needs review.');return {state:'accepted'};
}

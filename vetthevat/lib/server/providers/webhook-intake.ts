import {createHash} from "node:crypto";
import {ApiError} from "@/lib/server/api-v1";
import {verifyStripeEvent} from "@/lib/server/providers/stripe";
export interface DurableProviderInbox {
 // Must commit provider+event ID UNIQUE, raw digest and queued work atomically;
 // reject reused IDs with different digests. Returning means COMMIT acknowledged.
 save(input:{provider:'stripe';eventId:string;digest:string;payload:unknown}):Promise<void>;
}
export async function webhookBytes(request:Request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!request.body)throw new ApiError(400,'INVALID_REQUEST','JSON webhook required.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>262144){await reader.cancel();throw new ApiError(413,'INVALID_REQUEST','Webhook too large.');}chunks.push(r.value);}return Buffer.concat(chunks);}finally{reader.releaseLock();}
}
// Not mounted: subscription ownership reconciliation and the durable event
// worker must be implemented before acknowledging payment state changes.
export function stripeWebhookHandler(secret:string|undefined,store:DurableProviderInbox|undefined){return async(request:Request)=>{
 try{if(request.method!=='POST')return new Response(null,{status:405});if(!secret||!store)throw new ApiError(503,'UNAVAILABLE','Payment webhooks are not configured.');
  const raw=await webhookBytes(request),event=verifyStripeEvent(raw,request.headers.get('stripe-signature'),secret);
  await store.save({provider:'stripe',eventId:event.id,digest:createHash('sha256').update(raw).digest('hex'),payload:event});
  return Response.json({received:true},{headers:{'cache-control':'no-store'}});
 }catch(e){return Response.json({error:{code:e instanceof ApiError?e.code:'UNAVAILABLE',message:'Payment event was not confirmed.'}},{status:e instanceof ApiError?e.status:503,headers:{'cache-control':'no-store'}});}
};}

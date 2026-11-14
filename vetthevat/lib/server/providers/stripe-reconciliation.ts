import {ApiError,uuid} from "@/lib/server/api-v1";
import type {StripeConfiguration,StripePlan,stripeTestAdapter} from "@/lib/server/providers/stripe";
export type StripeLease={jobId:string;leaseId:string;event:{id:string;type:string;livemode:boolean;data:{object:Record<string,any>}};accountId:string|null;customerId:string|null;subscriptionId:string|null;checkoutId:string|null};
export type ReconciledEntitlement={subscriptionId:string;plan:StripePlan;status:'active'|'past_due'|'cancelled'|'pending';orsAddon:boolean};
export interface StripeReconciliationStore{claim():Promise<StripeLease|null>;finish(lease:StripeLease,result:ReconciledEntitlement|'ignored'|'expired'|null):Promise<boolean>;}
// Only current provider state can produce entitlements. A signed event snapshot,
// Checkout return URL or browser-selected plan never establishes payment.
export function stripeEntitlement(value:Record<string,any>,config:StripeConfiguration,owner:{accountId:string;customerId:string;subscriptionId?:string|null}):ReconciledEntitlement{
 uuid(owner.accountId);
 const invalid=()=>{throw new ApiError(503,'UNAVAILABLE','Subscription ownership, prices or lifecycle could not be verified.');};
 if(value.livemode!==false||!/^sub_[A-Za-z0-9]+$/.test(value.id)||value.customer!==owner.customerId||value.metadata?.vtv_account_id!==owner.accountId||owner.subscriptionId&&owner.subscriptionId!==value.id||!value.items||value.items.has_more!==false||!Array.isArray(value.items.data)||value.items.data.length<1||value.items.data.length>2)invalid();
 let plan:StripePlan|undefined,addon=false;
 for(const item of value.items.data){const price=item?.price;if(item.quantity!==1||!price||price.livemode!==false||price.currency!=='gbp'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)invalid();const found=(Object.keys(config.prices) as StripePlan[]).find(p=>config.prices[p]===price.id);if(found){if(plan||price.unit_amount!=={Basic:900,Starter:1500,Growth:2500}[found])invalid();plan=found;}else if(price.id===config.orsAddonPrice){if(addon||price.unit_amount!==500)invalid();addon=true;}else invalid();}
 if(!plan||addon&&plan!=='Basic')invalid();
 const statuses:Record<string,ReconciledEntitlement['status']>={active:'active',past_due:'past_due',canceled:'cancelled',unpaid:'cancelled',incomplete_expired:'cancelled',incomplete:'pending',trialing:'pending',paused:'pending'};
 if(!Object.hasOwn(statuses,value.status))invalid();const status=value.pause_collection?"pending":statuses[value.status];
 return {subscriptionId:value.id,plan:plan!,status,orsAddon:addon};
}
export async function reconcileStripeEvent(store:StripeReconciliationStore,provider:ReturnType<typeof stripeTestAdapter>,config:StripeConfiguration){
 const lease=await store.claim();if(!lease)return {state:'idle'};uuid(lease.jobId);uuid(lease.leaseId);let result:ReconciledEntitlement|'ignored'|'expired'|null=null;
 try{const event=lease.event;if(event.livemode!==false||!/^evt_[A-Za-z0-9]+$/.test(event.id)||!event.data?.object)throw Error('Invalid test event');
  const supported=/^customer\.subscription\.(created|updated|deleted|paused|resumed|pending_update\.applied|pending_update\.expired)$/.test(event.type)||/^checkout\.session\.(completed|async_payment_succeeded|async_payment_failed|expired)$/.test(event.type)||/^invoice\.(paid|payment_failed|payment_action_required|finalization_failed)$/.test(event.type);
  if(!supported)result='ignored';else if(event.type==='checkout.session.expired')result='expired';else{
   if(!lease.accountId||!lease.customerId||event.data.object.customer!==lease.customerId)throw Error('Unknown customer');uuid(lease.accountId);
   const object=event.data.object,subscriptionId=event.type.startsWith('customer.subscription.')?object.id:object.subscription??object.parent?.subscription_details?.subscription??lease.subscriptionId;
   if(typeof subscriptionId!=='string'||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)||event.type.startsWith('checkout.session.')&&lease.checkoutId!==object.id)throw Error('Unknown subscription or checkout');
   await provider.verifyCustomer(lease.accountId,lease.customerId);const current=await provider.subscription(subscriptionId);result=stripeEntitlement(current,config,{accountId:lease.accountId,customerId:lease.customerId,subscriptionId:lease.subscriptionId});
  }
 }catch{result=null;}
 // A failed/uncertain commit is never automatically repeated here. The durable
 // store controls expiration, bounded retries and dead-letter state.
 if(!await store.finish(lease,result))throw new ApiError(409,'CONFLICT','Billing reconciliation lease expired.');
 return {state:result===null?'retry-or-failed':typeof result==='string'?result:'reconciled'};
}

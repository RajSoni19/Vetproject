import {createHmac,timingSafeEqual} from "node:crypto";
import {ApiError,uuid} from "@/lib/server/api-v1";
export type StripePlan="Basic"|"Starter"|"Growth";
export type StripeConfiguration={key:string;publishableKey:string;webhookSecret:string;apiVersion:string;origin:string;prices:Record<StripePlan,string>;orsAddonPrice:string};
// This increment supports Stripe TEST mode only. Live keys/events are refused
// even if a caller sets an approval-like flag. Live payments need separate work.
export function readStripeConfiguration(env:Readonly<Record<string,string|undefined>>):StripeConfiguration|undefined{
 if(env.STRIPE_TEST_ENABLED!=="1"||env.STRIPE_TEST_CONNECTION_APPROVED!=="1")return undefined;
 const key=env.STRIPE_SECRET_KEY,publishableKey=env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,webhookSecret=env.STRIPE_WEBHOOK_SECRET,apiVersion=env.STRIPE_API_VERSION,origin=env.WEB_AUTH_ORIGIN;
 const prices={Basic:env.STRIPE_BASIC_PRICE_ID,Starter:env.STRIPE_STARTER_PRICE_ID,Growth:env.STRIPE_GROWTH_PRICE_ID},orsAddonPrice=env.STRIPE_ORS_ADDON_PRICE_ID;
 if(!key||!/^sk_test_[A-Za-z0-9]{16,}$/.test(key)||!publishableKey||!/^pk_test_[A-Za-z0-9]{16,}$/.test(publishableKey)||!webhookSecret||!/^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret)||!apiVersion||!/^20\d\d-\d\d-\d\d\.[a-z]+$/.test(apiVersion)||!origin)return undefined;
 try{if(new URL(origin).origin!==origin||!origin.startsWith('https://'))return undefined;}catch{return undefined;}
 if(Object.values(prices).some(p=>!p||!/^price_[A-Za-z0-9]{5,}$/.test(p))||!orsAddonPrice||!/^price_[A-Za-z0-9]{5,}$/.test(orsAddonPrice)||new Set([...Object.values(prices),orsAddonPrice]).size!==4)return undefined;
 return {key,publishableKey,webhookSecret,apiVersion,origin,prices:prices as Record<StripePlan,string>,orsAddonPrice};
}
export function verifyStripeEvent(raw:Uint8Array,header:string|null,secret:string,now=Date.now()){
 if(raw.byteLength<1||raw.byteLength>262144||!header||header.length>2048||!/^whsec_[A-Za-z0-9]{16,}$/.test(secret))throw new ApiError(400,'INVALID_REQUEST','Invalid payment webhook.');
 const parts=header.split(','),times=parts.filter(p=>p.startsWith('t='));if(times.length!==1||!/^t=[1-9]\d{9,11}$/.test(times[0]))throw new ApiError(400,'INVALID_REQUEST','Invalid payment signature.');
 const t=times[0].slice(2);if(Math.abs(now/1000-Number(t))>300)throw new ApiError(400,'INVALID_REQUEST','Payment signature expired.');
 const expected=createHmac('sha256',secret).update(t+'.').update(raw).digest();
 if(!parts.filter(p=>/^v1=[a-f0-9]{64}$/.test(p)).some(p=>timingSafeEqual(Buffer.from(p.slice(3),'hex'),expected)))throw new ApiError(400,'INVALID_REQUEST','Invalid payment signature.');
 let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new ApiError(400,'INVALID_REQUEST','Invalid payment event.');}
 if(!event||typeof event!=='object'||!/^evt_[A-Za-z0-9]+$/.test(event.id)||typeof event.type!=='string'||event.type.length>150||event.livemode!==false||!Number.isSafeInteger(event.created)||!event.data||typeof event.data.object!=='object'||event.account!==undefined)throw new ApiError(400,'INVALID_REQUEST','Unsupported payment event.');
 return event as {id:string;type:string;created:number;livemode:false;data:{object:Record<string,unknown>}};
}
export function stripeTestAdapter(config:StripeConfiguration,fetcher:typeof fetch=fetch){
 if(!config.key.startsWith('sk_test_'))throw new ApiError(503,'UNAVAILABLE','Test payment configuration required.');
 async function call(path:string,body?:URLSearchParams,idempotencyKey?:string){
  if(body&&(!idempotencyKey||!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)))throw new ApiError(400,'INVALID_REQUEST','Payment request reference required.');
  try{const response=await fetcher('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+config.key,'Stripe-Version':config.apiVersion,...(body?{'content-type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey!}:{})},body:body?.toString(),signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});if(!response.ok)throw Error();const value=await response.json();if(value.livemode===true||value.deleted===true)throw Error();return value;}catch{throw new ApiError(503,'UNAVAILABLE','Payment provider request could not be confirmed. Retry with the same reference.');}
 }
 return {
  async customer(input:{accountId:string;key:string}){uuid(input.accountId);const value=await call('customers',new URLSearchParams({'metadata[vtv_account_id]':input.accountId}),input.key);if(!/^cus_[A-Za-z0-9]+$/.test(value.id)||value.livemode!==false||value.metadata?.vtv_account_id!==input.accountId)throw new ApiError(503,'UNAVAILABLE','Billing customer could not be confirmed.');return {customerId:value.id as string};},
  async verifyCustomer(accountId:string,customerId:string){uuid(accountId);if(!/^cus_[A-Za-z0-9]+$/.test(customerId))throw new ApiError(400,'INVALID_REQUEST','Invalid customer reference.');const value=await call('customers/'+customerId);if(value.id!==customerId||value.livemode!==false||value.metadata?.vtv_account_id!==accountId)throw new ApiError(403,'FORBIDDEN','Billing customer ownership required.');return true;},
  async checkout(input:{accountId:string;customerId:string;plan:StripePlan;orsAddon:boolean;key:string}){
   uuid(input.accountId);if(!Object.hasOwn(config.prices,input.plan)||!/^cus_[A-Za-z0-9]+$/.test(input.customerId))throw new ApiError(400,'INVALID_REQUEST','Invalid payment selection.');
   if(input.orsAddon&&input.plan!=="Basic")throw new ApiError(400,'INVALID_REQUEST','ORS add-on is available with Basic only.');
   const priceId=config.prices[input.plan],price=await call('prices/'+priceId),amount={Basic:900,Starter:1500,Growth:2500}[input.plan];
   if(price.id!==priceId||price.active!==true||price.livemode!==false||price.currency!=='gbp'||price.unit_amount!==amount||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)throw new ApiError(503,'UNAVAILABLE','Verified GBP monthly price required.');
   if(input.orsAddon){const addon=await call('prices/'+config.orsAddonPrice);if(addon.id!==config.orsAddonPrice||addon.active!==true||addon.livemode!==false||addon.currency!=='gbp'||addon.unit_amount!==500||addon.recurring?.interval!=='month'||addon.recurring?.interval_count!==1)throw new ApiError(503,'UNAVAILABLE','Verified GBP monthly ORS add-on required.');}
   const customer=await call('customers/'+input.customerId);if(customer.id!==input.customerId||customer.livemode!==false||customer.metadata?.vtv_account_id!==input.accountId)throw new ApiError(403,'FORBIDDEN','Billing account ownership required.');
   const form=new URLSearchParams({mode:'subscription',customer:input.customerId,client_reference_id:input.accountId,'line_items[0][price]':priceId,'line_items[0][quantity]':'1','metadata[vtv_account_id]':input.accountId,'subscription_data[metadata][vtv_account_id]':input.accountId,success_url:config.origin+'/app/subscription?checkout=returned',cancel_url:config.origin+'/app/subscription'});if(input.orsAddon){form.set('line_items[1][price]',config.orsAddonPrice);form.set('line_items[1][quantity]','1');}
   const session=await call('checkout/sessions',form,input.key);if(!/^cs_test_[A-Za-z0-9]+$/.test(session.id)||session.livemode!==false||typeof session.url!=='string'||new URL(session.url).origin!=='https://checkout.stripe.com')throw new ApiError(503,'UNAVAILABLE','Checkout could not be confirmed.');
   // Creating/returning checkout is not payment or subscription confirmation.
   return {checkoutId:session.id as string,url:session.url as string,paymentConfirmed:false as const};
  },
  async portal(input:{accountId:string;customerId:string;key:string}){uuid(input.accountId);if(!/^cus_[A-Za-z0-9]+$/.test(input.customerId))throw new ApiError(400,'INVALID_REQUEST','Invalid billing customer.');const customer=await call('customers/'+input.customerId);if(customer.id!==input.customerId||customer.livemode!==false||customer.metadata?.vtv_account_id!==input.accountId)throw new ApiError(403,'FORBIDDEN','Billing account ownership required.');const form=new URLSearchParams({customer:input.customerId,return_url:config.origin+'/app/subscription'}),session=await call('billing_portal/sessions',form,input.key);if(!/^bps_[A-Za-z0-9]+$/.test(session.id)||session.livemode!==false||typeof session.url!=='string'||new URL(session.url).origin!=='https://billing.stripe.com')throw new ApiError(503,'UNAVAILABLE','Billing portal could not be confirmed.');return {portalId:session.id as string,url:session.url as string};},
  async subscription(id:string){if(!/^sub_[A-Za-z0-9]+$/.test(id))throw new ApiError(400,'INVALID_REQUEST','Invalid subscription reference.');const result=await call('subscriptions/'+id);if(result.id!==id||result.livemode!==false)throw new ApiError(503,'UNAVAILABLE','Subscription could not be verified.');return result;}
 };
}

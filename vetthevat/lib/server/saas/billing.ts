import {createHash} from "node:crypto";
import {ApiError,jsonBody,objectBody,uuid} from "@/lib/server/api-v1";
import {readStripeConfiguration,stripeTestAdapter,type StripePlan} from "@/lib/server/providers/stripe";
import {readSaasConfiguration} from "@/lib/server/saas/config";
import {managedProfileSelected,readManagedDeployment} from "@/lib/server/deployment-profile";
import {ownedBillingAccounts} from "@/lib/server/saas/onboarding";
import type {WebAuthServices} from "@/lib/server/web-auth/runtime";
import type {Principal,Sql} from "@/lib/server/web-auth/store";
import {platformEnabled,platformTransaction} from "@/lib/server/platform-admin";
export const billingSchemaSha256="26f6316796c9eccc42ae59603bbe4ddbb61309a01738d9e282fe3f02df846cad";
export function billingEnabled(env:Readonly<Record<string,string|undefined>>){return env.SAAS_STRIPE_BILLING_ENABLED==='1'&&env.SAAS_STRIPE_BILLING_SCHEMA_SHA256===billingSchemaSha256&&env.SAAS_STRIPE_CHECKOUT_SCHEMA_SHA256==='d0855aa14733375f1aef905f6ea331a6610b00f3bcb9ee11f9963012f4f904e4'&&Boolean(managedProfileSelected(env)?readManagedDeployment(env):readSaasConfiguration(env));}
async function transaction<T>(s:WebAuthServices,work:(sql:Sql)=>Promise<T>){return s.store.transaction(async sql=>{try{return await work(sql);}catch(e){const code=(e as {code?:string}).code;if(code==='42501')throw new ApiError(403,'FORBIDDEN','Billing account ownership is required.');if(code==='23505')throw new ApiError(409,'CONFLICT','An existing subscription or checkout must be managed before creating another. Refresh billing and resume the existing checkout.');throw e;}});}
export async function billingRequest(request:Request,s:WebAuthServices,p:Principal,env:Readonly<Record<string,string|undefined>>=process.env,provider?:ReturnType<typeof stripeTestAdapter>){
 const config=readStripeConfiguration(env),available=billingEnabled(env)&&Boolean(config),context=(accountId:string)=>transaction(s,async sql=>(await sql.query('SELECT saas.billing_context($1,$2) AS context',[p.tokenHash,accountId])).rows[0].context);
 if(request.method==='GET'){const search=new URL(request.url).searchParams;if([...search.keys()].some(k=>k!=='accountId')||search.getAll('accountId').length>1)throw new ApiError(400,'INVALID_REQUEST','Invalid billing account selection.');const accounts=await ownedBillingAccounts(s,p),id=search.get('accountId');return {configured:available,accounts,context:billingEnabled(env)&&id?await context(uuid(id)):null,paymentConfirmed:false};}
 if(!available||!config)throw new ApiError(503,'UNAVAILABLE','Stripe test billing requires the approved schema and verified test provider configuration.');
 const body=objectBody(await jsonBody(request,3000),['action','accountId','plan','orsAddon']),accountId=uuid(body.accountId),rawKey=request.headers.get('idempotency-key');
 if(platformEnabled(env)){const account=await platformTransaction(s,async sql=>(await sql.query("SELECT platform_admin.customer($1,$2,'context') AS result",[p.tokenHash,accountId])).rows[0].result);if(account.contract)throw new ApiError(409,'CONFLICT','This account has a reviewed manual subscription. Submit a plan change request for billing review.');}
 if(!rawKey||!/^[A-Za-z0-9_-]{16,128}$/.test(rawKey))throw new ApiError(400,'INVALID_REQUEST','A stable billing request reference is required.');
 const key=createHash('sha256').update(accountId+':'+rawKey).digest('hex'),adapter=provider??stripeTestAdapter(config);let account=await context(accountId);
 if(body.action==='portal'){if(Object.hasOwn(body,'plan')||Object.hasOwn(body,'orsAddon'))throw new ApiError(400,'INVALID_REQUEST','Portal requests do not select a plan.');if(!account.customerId)throw new ApiError(409,'CONFLICT','A billing customer must exist before opening the portal.');const result=await adapter.portal({accountId,customerId:account.customerId,key});await context(accountId);return result;}
 if(body.action!=='checkout'||!['Basic','Starter','Growth'].includes(String(body.plan))||typeof body.orsAddon!=='boolean'||body.orsAddon&&body.plan!=='Basic')throw new ApiError(400,'INVALID_REQUEST','Select a supported subscription.');
 if(!account.customerId){const customer=await adapter.customer({accountId,key:createHash('sha256').update('customer:'+accountId).digest('hex')});await transaction(s,async sql=>{await sql.query('SELECT saas.bind_stripe_customer($1,$2,$3)',[p.tokenHash,accountId,customer.customerId]);});account=await context(accountId);}
 const reservation=await transaction(s,async sql=>(await sql.query('SELECT saas.reserve_stripe_checkout($1,$2,$3,$4,$5) AS reservation',[p.tokenHash,accountId,key,body.plan,body.orsAddon])).rows[0].reservation);
 if(reservation.checkoutId&&reservation.checkoutUrl)return {checkoutId:reservation.checkoutId,url:reservation.checkoutUrl,paymentConfirmed:false};
 const result=await adapter.checkout({accountId,customerId:account.customerId,plan:body.plan as StripePlan,orsAddon:body.orsAddon,key});
 await transaction(s,async sql=>{await sql.query('SELECT saas.complete_stripe_checkout($1,$2,$3,$4,$5)',[p.tokenHash,accountId,key,result.checkoutId,result.url]);});return result;
}

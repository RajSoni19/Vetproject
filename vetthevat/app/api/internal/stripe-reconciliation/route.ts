import {timingSafeEqual} from "node:crypto";
import {runStripeReconciliation} from "@/lib/server/providers/stripe-worker-runtime";
import {billingEnabled} from "@/lib/server/saas/billing";
export const runtime="nodejs";
export async function POST(request:Request){
 const headers={'cache-control':'no-store'},expected=process.env.STRIPE_WORKER_SECRET,supplied=request.headers.get('authorization')??'';
 if(!billingEnabled(process.env)||!expected||expected.length<32)return Response.json({error:'Billing worker is disabled.'},{status:503,headers});
 const token=supplied.startsWith('Bearer ')?supplied.slice(7):'',a=Buffer.from(expected),b=Buffer.from(token);
 if(a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:'Unauthorized.'},{status:401,headers});
 try{return Response.json(await runStripeReconciliation(),{headers});}catch{return Response.json({error:'Billing reconciliation could not be confirmed.'},{status:503,headers});}
}

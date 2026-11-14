import {stripeWebhookHandler} from "@/lib/server/providers/webhook-intake";
import {providerInboxRuntime} from "@/lib/server/providers/runtime";
import {readStripeConfiguration} from "@/lib/server/providers/stripe";
import {billingEnabled} from "@/lib/server/saas/billing";
export const runtime="nodejs";
export async function POST(request:Request){
 const config=billingEnabled(process.env)?readStripeConfiguration(process.env):undefined;
 if(!config)return stripeWebhookHandler(undefined,undefined)(request);
 const storage=providerInboxRuntime();if(!storage)return stripeWebhookHandler(undefined,undefined)(request);
 try{return await stripeWebhookHandler(config.webhookSecret,storage.inbox)(request);}finally{await storage.close();}
}

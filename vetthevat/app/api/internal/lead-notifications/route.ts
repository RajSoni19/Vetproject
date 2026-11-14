import { leadWorkerHandler } from "@/lib/server/leads/worker";
import { leadServices } from "@/lib/server/leads/runtime";
import { processOneLeadNotification } from "@/lib/server/leads/providers";
import { LeadError } from "@/lib/server/leads/core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.LEADS_WORKER_SECRET;
  const approved = process.env.LEADS_EMAIL_DELIVERY_APPROVED === "1" && secret !== process.env.LEADS_HASH_SECRET && secret !== process.env.LEADS_RECEIPT_SECRET;
  return leadWorkerHandler(approved ? secret : undefined, async () => {
    const services = leadServices();
    if (!services) throw new LeadError(503, "UNAVAILABLE", "Lead services are unavailable.");
    const result = await processOneLeadNotification(services.store, services.mailer);
    return { state: result.state };
  })(request);
}

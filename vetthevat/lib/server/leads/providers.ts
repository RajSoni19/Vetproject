import { LeadError } from "@/lib/server/leads/core";
import type { NotificationClaim, NotificationStore } from "@/lib/server/leads/postgres";
import {smtpMailer,type SmtpConfiguration,type SmtpTransport} from "@/lib/server/providers/smtp";

export function turnstileVerifier(secret: string, hostname: string, fetcher: typeof fetch = fetch, action:"lead-enquiry"|"contact-enquiry"="lead-enquiry") {
  return async (token: string, idempotencyKey: string) => {
    let response: Response;
    try { response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret, response: token, idempotency_key: idempotencyKey }), signal: AbortSignal.timeout(8000), cache: "no-store", redirect: "error" }); }
    catch { throw new LeadError(503, "UNAVAILABLE", "The security check is unavailable. Please try again."); }
    if (!response.ok) throw new LeadError(503, "UNAVAILABLE", "The security check is unavailable. Please try again.");
    const result = await response.json();
    const age = Date.now() - Date.parse(result.challenge_ts);
    return result.success === true && result.hostname === hostname && result.action === action && Number.isFinite(age) && age >= -5000 && age <= 300000;
  };
}
export const leadRecipient = "admin@vetthevat.com";
export function escapeLeadHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
export function notificationEmail(claim: NotificationClaim) {
  const fields = [["Lead reference", claim.leadId], ["Submitted at", claim.createdAt], ["Customer name", claim.lead.fullName], ["Business name", claim.lead.businessName], ["Email", claim.lead.email], ["Phone", claim.lead.phone], ["Requested service", claim.lead.service], ["Additional requirements", claim.lead.requirements || "None provided"]];
  return { to: leadRecipient, subject: `VET THE VAT enquiry ${claim.leadId}`, text: fields.map(([name, value]) => `${name}: ${value}`).join("\n"), html: `<h1>New VET THE VAT enquiry</h1><dl>${fields.map(([name, value]) => `<dt>${name}</dt><dd style="white-space:pre-wrap">${escapeLeadHtml(value)}</dd>`).join("")}</dl>`,reference:`lead-notification/${claim.id}` };
}
export interface LeadMailer { send(claim: NotificationClaim): Promise<{ accepted: true; providerId: string }> }
export function smtpLeadMailer(config:SmtpConfiguration,transport?:SmtpTransport): LeadMailer {
  const mailer=smtpMailer(config,transport);
  return { async send(claim) {
    try{const result=await mailer.send(notificationEmail(claim));return {accepted:true,providerId:result.messageId};}
    catch{throw new LeadError(503,"EMAIL_UNAVAILABLE","Notification remains queued for review or retry.");}
  } };
}
export async function processOneLeadNotification(store: NotificationStore, mailer: LeadMailer | undefined) {
  // The route/worker owner must additionally authorize invocation. No default
  // scheduler or public endpoint sends mail. Disabled mail never claims a job.
  if (!mailer) throw new LeadError(503, "UNAVAILABLE", "Email delivery is not enabled and approved.");
  const claim = await store.claim();
  if (!claim) return { state: "idle" };
  const age = Date.now() - Date.parse(claim.firstAttemptAt);
  if (!Number.isFinite(age) || age < -5000 || age >= 22 * 3600000 || claim.attempt > 8) {
    await store.failed(claim);
    return { state: "retry_or_review", reference: claim.leadId };
  }
  let result;
  try { result = await mailer.send(claim); if (result.accepted !== true || typeof result.providerId !== "string" || !result.providerId) throw new Error("Acceptance not confirmed"); }
  catch { await store.failed(claim); return { state: "retry_or_review", reference: claim.leadId }; }
  // An acknowledgement/COMMIT failure has an uncertain outcome. Leave the lease
  // to recover with the same provider key, never acknowledge a failed send.
  await store.accepted(claim, result.providerId);
  return { state: "accepted", reference: claim.leadId };
}

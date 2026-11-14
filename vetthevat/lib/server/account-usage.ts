import { ApiError, uuid } from "@/lib/server/api-v1";
import {subscriptionPlans,trialTerms} from "@/lib/plan-catalog";
import {resolvePlan,type PlanCode} from "@/lib/server/entitlements";

// Kept for older integrations as Starter metadata only, never an active default.
export const monthlyInvoiceAllowance = subscriptionPlans.Starter.invoices;
export type BillingPeriod = { start: string; end: string };
export function accountUsageSummary(limit:number, used:number, reserved=0) {
  if(![limit,used,reserved].every(value=>Number.isSafeInteger(value)&&value>=0))throw new ApiError(503,"UNAVAILABLE","Usage information is unavailable.");
  return {limit,used,reserved,remaining:Math.max(0,limit-used-reserved),exhausted:used+reserved>=limit};
}
export type UsageAccount = {accountId:string; period:BillingPeriod; active:boolean; plan:PlanCode|"Trial"};
export interface CompanyBillingResolver {
  // SERVER implementation must verify active membership and resolve the billing
  // account, never accept an account ID or allowance from a request body.
  resolve(userId:string,companyId:string):Promise<UsageAccount|null>;
}
export interface AtomicUsageLedger {
  // One atomic account+period operation counts committed AND pending reservations.
  // Unique account+period+invoice ID; existing invoice/retry consumes no new slot.
  // Company ownership must also be checked by the eventual transaction/DAL.
  reserve(input:{accountId:string;companyId:string;invoiceId:string;period:BillingPeriod;limit:number}):Promise<{allowed:boolean;used:number;reserved:number;reservationId:string|null}>;
  // Must be coordinated atomically with authoritative invoice creation; these
  // signatures alone do not implement transactions, retries or durable recovery.
  commit(reservationId:string):Promise<void>;
  release(reservationId:string):Promise<void>;
}
export async function reserveInvoiceAllowance(input:{userId:string;companyId:string;invoiceId:string},resolver:CompanyBillingResolver|undefined,ledger:AtomicUsageLedger|undefined,now=Date.now()) {
  const userId=uuid(input.userId),companyId=uuid(input.companyId),invoiceId=uuid(input.invoiceId);
  if(!resolver||!ledger)throw new ApiError(503,"UNAVAILABLE","Account usage enforcement is not configured.");
  const account=await resolver.resolve(userId,companyId);
  if(!account?.active)throw new ApiError(403,"FORBIDDEN","An active company subscription is required.");
  const limit=account.plan==="Trial"?trialTerms.invoices:resolvePlan(account.plan).invoices;
  const accountId=uuid(account.accountId),start=Date.parse(account.period.start),end=Date.parse(account.period.end);
  if(!Number.isFinite(now)||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||now<start||now>=end)throw new ApiError(503,"UNAVAILABLE","The current billing period could not be verified.");
  const reservation=await ledger.reserve({accountId,companyId,invoiceId,period:account.period,limit});
  accountUsageSummary(limit,reservation.used,reservation.reserved);
  if(typeof reservation.allowed!=="boolean"||reservation.allowed&&(reservation.used+reservation.reserved<1||reservation.used+reservation.reserved>limit))throw new ApiError(503,"UNAVAILABLE","Invoice quota could not be verified.");
  if(!reservation.allowed)throw new ApiError(409,"CONFLICT",`The shared period allowance of ${limit} invoices has been reached across this account's companies.`);
  if(typeof reservation.reservationId!=="string"||!reservation.reservationId.trim()||reservation.reservationId.length>512)throw new ApiError(503,"UNAVAILABLE","Invoice quota could not be reserved.");
  return {...reservation,accountId,period:account.period,usage:accountUsageSummary(limit,reservation.used,reservation.reserved)};
}

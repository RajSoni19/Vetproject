import {ApiError} from "@/lib/server/api-v1";
import {subscriptionPlans as catalog} from "@/lib/plan-catalog";
export const subscriptionPlans=catalog;
export type PlanCode=keyof typeof subscriptionPlans;
export function resolvePlan(value:unknown){
  if(typeof value!=="string"||!Object.hasOwn(subscriptionPlans,value))throw new ApiError(503,"UNAVAILABLE","Verified subscription entitlements are unavailable.");
  return subscriptionPlans[value as PlanCode];
}
// Limits/prices are an owner-approved contract, not a verified active subscription.
// ORS entitlement metadata grants no product access and implements no ORS feature.
export interface AtomicCapacityLedger {
  reserve(input:{billingAccountId:string;resource:"company"|"member";resourceId:string;limit:number;idempotencyKey:string}):Promise<{allowed:boolean;reservationId:string|null}>;
}

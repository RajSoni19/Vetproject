// Historical local comparison utilities retained only for offline regression tests.
import type {Invoice} from "@/lib/domain";
import {subscriptionPlans, type PlanCode} from "@/lib/plan-catalog";
export type SubscriptionPreview={periodStart:string;periodEnd:string;expiresOn:string;inAppReminders:boolean;emailReminders:boolean;renewalMethod:"Manual"|"Card"|"Direct Debit"};
export const defaultSubscriptionPreview:SubscriptionPreview={periodStart:"",periodEnd:"",expiresOn:"",inAppReminders:true,emailReminders:true,renewalMethod:"Manual"};
function day(value:string){const timestamp=Date.parse(value+"T00:00:00Z");return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value?timestamp:null;}
export function validateSubscriptionPreview(value:SubscriptionPreview){
  if(!value||typeof value!=="object"||!["Manual","Card","Direct Debit"].includes(value.renewalMethod)||typeof value.inAppReminders!=="boolean"||typeof value.emailReminders!=="boolean")throw new Error("Choose valid local renewal preferences.");
  if(Boolean(value.periodStart)!==Boolean(value.periodEnd)||value.periodStart&&(day(value.periodStart)===null||day(value.periodEnd)===null||value.periodStart>=value.periodEnd))throw new Error("Choose a valid preview period with an end after its start.");
  if(value.expiresOn&&day(value.expiresOn)===null)throw new Error("Choose a valid preview expiry date.");
  return value;
}
export function previewInvoiceUsage(invoices:Invoice[],start:string,end:string,plan:PlanCode="Starter"){
  validateSubscriptionPreview({...defaultSubscriptionPreview,periodStart:start,periodEnd:end});
  if(!start||!end)return null;
  const first=day(start)!,last=day(end)!;
  const used=new Set(invoices.filter(row=>Number.isFinite(Date.parse(row.createdAt))&&Date.parse(row.createdAt)>=first&&Date.parse(row.createdAt)<last).map(row=>row.id)).size;
  if(!Object.hasOwn(subscriptionPlans,plan))throw new Error("Choose a valid preview plan.");
  const allowance=subscriptionPlans[plan].invoices;
  return {allowance,used,remaining:Math.max(0,allowance-used),over:Math.max(0,used-allowance),unknownDates:invoices.filter(row=>!Number.isFinite(Date.parse(row.createdAt))).length};
}
export function expiryPreview(expiresOn:string,now=Date.now()){
  const expires=day(expiresOn);if(expires===null||!Number.isFinite(now))return null;
  const days=Math.ceil((expires-now)/86400000);
  return {days,severity:days<=0?"expired":days<=7?"urgent":days<=30?"upcoming":"later"};
}

// Owner-approved commercial terms. This catalogue never grants account access.
export const vatPlanFeatures = [
  "Supplier and customer management", "Invoice and receipt scanning", "Manual invoice creation",
  "Automatic VAT calculations", "Quarterly and yearly VAT reports", "PDF, CSV and Excel exports"
] as const;
export const trialTerms = { days: 14, invoices: 100, period: "trial", orsIncluded: true, cardRequired: false } as const;
export const subscriptionPlans = {
  Basic: { code: "Basic", currency: "GBP", monthlyPrice: "9.00", invoices: 30, companies: 2, membersIncludingOwner: 2, historyDays: 90, orsIncluded: false, orsOptionalMonthlyPrice: "5.00", prioritySupport: false, recommended: false },
  Starter: { code: "Starter", currency: "GBP", monthlyPrice: "15.00", invoices: 100, companies: 2, membersIncludingOwner: 4, historyDays: 180, orsIncluded: true, orsOptionalMonthlyPrice: null, prioritySupport: false, recommended: true },
  Growth: { code: "Growth", currency: "GBP", monthlyPrice: "25.00", invoices: 300, companies: 3, membersIncludingOwner: 6, historyDays: null, orsIncluded: true, orsOptionalMonthlyPrice: null, prioritySupport: true, recommended: false }
} as const;
export type PlanCode = keyof typeof subscriptionPlans;
export function planMonthlyPrice(code: PlanCode, includeOrs = false): string {
  const plan = subscriptionPlans[code];
  return ((Number(plan.monthlyPrice) * 100 + (includeOrs ? Number(plan.orsOptionalMonthlyPrice ?? 0) * 100 : 0)) / 100).toFixed(2);
}

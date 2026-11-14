import { ProposedPlanInformation } from "@/components/proposed-plan-information";
import { PageHeader } from "@/components/workspace-kit";
import { Card } from "@/components/ui/card";

export default function SubscriptionPage() {
  return <>
    <PageHeader title="Subscription and usage" description="Billing setup required. Subscription status and account usage must come from the verified billing service." />
    <Card className="mb-6 p-5">
      <h2 className="text-lg font-bold">Account usage unavailable</h2>
      <p className="mt-2 text-sm text-muted">No authoritative billing account, active subscription or billing period has been connected. No payment method or renewal is active through this website.</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-3">{["Verified plan allowance", "Verified used", "Verified remaining"].map(label => <div key={label} className="rounded-lg border border-line p-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-2 text-xl font-bold">Unavailable</dd></div>)}</dl>
      <p className="mt-4 text-sm text-muted">Invoice allowances are shared across a billing account's companies. Browser preferences cannot activate a plan, add ORS access or change an allowance.</p>
    </Card>
    <Card className="mb-8 p-5"><h2 className="font-bold">Billing history unavailable</h2><p className="mt-2 text-sm text-muted">Verified invoices, payments, renewal dates and payment methods will appear after secure billing setup. No billing records are generated here.</p></Card>
    <ProposedPlanInformation />
  </>;
}

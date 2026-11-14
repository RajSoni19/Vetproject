import Link from "next/link";
import type { Invoice } from "@/lib/domain";
import { dashboardOverview } from "@/lib/dashboard-overview";
import { formatCurrency } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";

export function DashboardPosition({ rows }: { rows: Invoice[] }) {
  const overview = dashboardOverview(rows);
  return <section className="mb-7" aria-labelledby="recorded-vat-heading">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="recorded-vat-heading" className="text-lg font-semibold tracking-tight">Recorded VAT position</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Reviewed and confirmed invoices matching your filters. Purchase and sale direction must be explicitly recorded.</p></div>
      <Link href="/app/vat" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Open VAT breakdown →</Link>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">{overview.currencies.map(total => <Card key={total.currency} className="min-w-0 overflow-hidden" data-vat-position={total.currency}>
      <div className="flex items-center justify-between border-b border-line bg-brand-50 px-5 py-3"><h3 className="text-sm font-semibold">{total.currency}</h3><span className="text-xs text-brand-800">Reviewed local records</span></div>
      <dl className="grid gap-5 p-5 sm:grid-cols-2">{([
        ["Sales · VAT inclusive", total.sales.count ? total.sales.gross : null, `${total.sales.count} explicitly recorded sales`],
        ["Purchases · VAT inclusive", total.purchases.count ? total.purchases.gross : null, `${total.purchases.count} explicitly recorded purchases`],
        ["Output VAT · recorded sales", total.sales.count ? total.sales.vat : null, "From invoice VAT amounts"],
        ["Input VAT · recorded purchases", total.purchases.count ? total.purchases.vat : null, "Recoverability not assessed"]
      ] as const).map(([label,value,note]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-2 break-words text-xl font-semibold tracking-tight tabular-nums">{value === null ? "Not recorded" : formatCurrency(value,total.currency)}</dd><p className="mt-1 text-[11px] text-muted">{note}</p></div>)}</dl>
      <div className="border-t border-line bg-wash px-5 py-4"><p className="text-xs font-medium text-muted">Recorded output less input VAT</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums" data-recorded-vat-difference>{total.recordedVatDifference === null ? "Not available" : formatCurrency(total.recordedVatDifference,total.currency)}</p><p className="mt-2 text-xs leading-5 text-muted">A recorded difference, not VAT payable, reclaimable or a submitted return. Incomplete records and input recoverability may change the tax position.</p>
      {total.unclassified.count > 0 ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{total.unclassified.count} reviewed invoices have no purchase/sale direction: {formatCurrency(total.unclassified.gross,total.currency)} gross and {formatCurrency(total.unclassified.vat,total.currency)} VAT are excluded from the comparison. Review their direction in invoice editing.</p> : null}</div>
    </Card>)}</div>
    {!overview.currencies.length ? <Feedback title="No reviewed invoices in this selection">Review and confirm invoices to see their recorded VAT position. No tax figures have been estimated.</Feedback> : null}
    {overview.excludedCount > 0 ? <p className="mt-3 text-xs leading-5 text-muted">{overview.excludedCount} draft or unconfirmed records are excluded from this position. Invoice statistics and the totals below still follow your selected filters.</p> : null}
  </section>;
}

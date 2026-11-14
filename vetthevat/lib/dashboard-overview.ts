import type { Invoice } from "@/lib/domain";
import { sumRecords } from "@/lib/reporting";
import { fromMinorUnits, toMinorUnits } from "@/lib/money";

// Presentation aggregation only. Caller supplies the existing report selection.
// Unknown direction is never inferred from supplier names, VAT rates or amounts.
export function dashboardOverview(rows: Invoice[]) {
  const reviewed = rows.filter(row => row.status !== "Draft" && row.reviewStatus === "Reviewed" && row.processingStatus === "Confirmed");
  return {
    excludedCount: rows.length - reviewed.length,
    currencies: [...new Set(reviewed.map(row => row.currency))].sort().map(currency => {
      const group = reviewed.filter(row => row.currency === currency);
      const purchases = sumRecords(group.filter(row => row.transactionType === "Purchase"));
      const sales = sumRecords(group.filter(row => row.transactionType === "Sale"));
      const unclassified = sumRecords(group.filter(row => row.transactionType !== "Purchase" && row.transactionType !== "Sale"));
      return { currency, purchases, sales, unclassified,
        recordedVatDifference: purchases.count || sales.count
          ? fromMinorUnits(toMinorUnits(sales.vat) - toMinorUnits(purchases.vat)) : null };
    })
  };
}

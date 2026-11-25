"use client";

import {ukDate,ukWorkbook} from "@/lib/uk-date";
import { useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Calculator, Download, FileSpreadsheet, ArrowUpRight, ArrowDownLeft, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAppState } from "@/components/app-state";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { ServerVatOverview } from "@/components/server-vat-overview";

export function VatOverviewPage() {
  const { selectedCompany, selectedCompanyId, invoices, documents } = useAppState();
  const [period, setPeriod] = useState<"all" | "quarter" | "month">("all");

  const companyInvoices = useMemo(() => {
    return invoices.filter((inv) => !inv.companyId || inv.companyId === selectedCompanyId);
  }, [invoices, selectedCompanyId]);

  const vatSummary = useMemo(() => {
    let inputVat = 0;
    let outputVat = 0;
    let inputNet = 0;
    let outputNet = 0;

    const rateGroups: Record<string, { net: number; vat: number; gross: number; count: number }> = {
      "Standard (20%)": { net: 0, vat: 0, gross: 0, count: 0 },
      "Reduced (5%)": { net: 0, vat: 0, gross: 0, count: 0 },
      "Zero-rated (0%)": { net: 0, vat: 0, gross: 0, count: 0 },
      "Exempt / Outside": { net: 0, vat: 0, gross: 0, count: 0 }
    };

    for (const inv of companyInvoices) {
      const isSale = inv.transactionType === "Sale";
      const net = inv.subtotal || 0;
      const vat = inv.vatAmount || 0;

      if (isSale) {
        outputNet += net;
        outputVat += vat;
      } else {
        inputNet += net;
        inputVat += vat;
      }

      // Group by lines or estimate
      if (inv.lineItems && inv.lineItems.length) {
        for (const line of inv.lineItems) {
          const lNet = line.netAmount || 0;
          const lVat = line.vatAmount || 0;
          const rate = line.vatRate;

          let groupName = "Standard (20%)";
          if (rate === 0) groupName = "Zero-rated (0%)";
          else if (rate === 5) groupName = "Reduced (5%)";
          else if (rate === 20) groupName = "Standard (20%)";
          else groupName = "Exempt / Outside";

          rateGroups[groupName].net += lNet;
          rateGroups[groupName].vat += lVat;
          rateGroups[groupName].gross += lNet + lVat;
          rateGroups[groupName].count += 1;
        }
      } else {
        const group = vat > 0 ? "Standard (20%)" : "Zero-rated (0%)";
        rateGroups[group].net += net;
        rateGroups[group].vat += vat;
        rateGroups[group].gross += net + vat;
        rateGroups[group].count += 1;
      }
    }

    const netVatPayable = outputVat - inputVat;

    return {
      inputNet,
      inputVat,
      outputNet,
      outputVat,
      netVatPayable,
      rateGroups
    };
  }, [companyInvoices]);

  const handleExportExcel = () => {
    const compName = selectedCompany?.name || "Workspace";
    const compCurrency = selectedCompany?.currency || "GBP";
    const summaryRows = [
      { Metric: "Company", Value: compName },
      { Metric: "VAT Registration Number", Value: selectedCompany?.vatNumber || "Not registered" },
      { Metric: "Total Input VAT (Purchases reclaimable)", Value: vatSummary.inputVat },
      { Metric: "Total Output VAT (Sales payable)", Value: vatSummary.outputVat },
      { Metric: "Net VAT Position", Value: vatSummary.netVatPayable }
    ];

    const groupRows = Object.entries(vatSummary.rateGroups).map(([rate, data]) => ({
      "Tax Treatment": rate,
      "Net Amount": data.net,
      "VAT Amount": data.vat,
      "Gross Total": data.gross,
      "Item Count": data.count
    }));

    const invoiceRows = companyInvoices.map((inv) => {
      const doc = documents.find((d) => d.id === inv.documentId);
      const pdfLink = doc?.previewUrl || doc?.secureUrl || doc?.localPreviewUrl || "";
      return {
        "Invoice #": inv.invoiceNumber,
        Date: inv.invoiceDate,
        Supplier: inv.supplierName,
        Customer: inv.customerName,
        Type: inv.transactionType || "Purchase",
        Status: inv.status,
        Net: inv.subtotal,
        VAT: inv.vatAmount,
        Total: inv.totalAmount,
        Currency: inv.currency,
        "Invoice PDF Link": pdfLink ? { t: "s", v: pdfLink, l: { Target: pdfLink, Tooltip: "Open Invoice PDF" } } : "No PDF link"
      };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "VAT Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groupRows), "Tax Groups");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceRows), "Invoices");

    XLSX.writeFile(ukWorkbook(wb), `VAT_Return_${compName.replace(/\s+/g, "_")}.xlsx`);
  };

  const compCurrency = selectedCompany?.currency || "GBP";

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-brand-700" />
              <h1 className="text-2xl font-bold">VAT Returns &amp; Tax Management</h1>
            </div>
            <p className="mt-1 text-sm text-muted">
              Consolidated UK VAT position, reclaimable input tax, output tax collected and breakdown by tax rate for {selectedCompany?.name || "your workspace"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="mr-1.5 h-4 w-4" /> Download VAT Summary (.xlsx)
            </Button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-wash p-4">
            <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
              <span>Input VAT (Purchases)</span>
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink">
              {formatCurrency(vatSummary.inputVat, compCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted">From {formatCurrency(vatSummary.inputNet, compCurrency)} net spend</p>
          </div>

          <div className="rounded-xl border border-line bg-wash p-4">
            <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
              <span>Output VAT (Sales)</span>
              <ArrowUpRight className="h-4 w-4 text-blue-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-ink">
              {formatCurrency(vatSummary.outputVat, compCurrency)}
            </p>
            <p className="mt-1 text-xs text-muted">From {formatCurrency(vatSummary.outputNet, compCurrency)} net sales</p>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
            <div className="flex items-center justify-between text-brand-900 text-xs font-semibold uppercase tracking-wider">
              <span>Net VAT {vatSummary.netVatPayable >= 0 ? "Payable to HMRC" : "Reclaimable"}</span>
              <ShieldCheck className="h-4 w-4 text-brand-700" />
            </div>
            <p className="mt-2 text-2xl font-bold text-brand-800">
              {formatCurrency(Math.abs(vatSummary.netVatPayable), compCurrency)}
            </p>
            <p className="mt-1 text-xs text-brand-700">
              {vatSummary.netVatPayable >= 0 ? "Liability to pay" : "Refund due from HMRC"}
            </p>
          </div>
        </div>
      </Card>

      {/* Tax Rate Groups Breakdown */}
      <Card className="p-6">
        <h2 className="text-base font-bold">Tax Groups &amp; Classification Breakdown</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-wash/60 text-xs uppercase text-muted font-semibold">
              <tr>
                <th className="p-3">Tax Treatment</th>
                <th className="p-3">Count</th>
                <th className="p-3">Net Amount</th>
                <th className="p-3">VAT Amount</th>
                <th className="p-3 text-right">Gross Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {Object.entries(vatSummary.rateGroups).map(([group, data]) => (
                <tr key={group} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-ink">{group}</td>
                  <td className="p-3 text-muted">{data.count} items</td>
                  <td className="p-3 tabular-nums">{formatCurrency(data.net, compCurrency)}</td>
                  <td className="p-3 tabular-nums">{formatCurrency(data.vat, compCurrency)}</td>
                  <td className="p-3 text-right font-bold tabular-nums text-ink">
                    {formatCurrency(data.gross, compCurrency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invoices Contributing to Return */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Invoices in Current Return ({companyInvoices.length})</h2>
          <Link href="/app/invoices/new" className="text-xs font-semibold text-brand-700 underline">
            + Add Invoice
          </Link>
        </div>
        {companyInvoices.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-wash/60 uppercase text-muted font-semibold">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Counterparty</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Net</th>
                  <th className="p-3">VAT</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {companyInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold">
                      <Link href={`/app/invoices/${inv.id}`} className="text-brand-700 underline">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="p-3 text-muted">{ukDate(inv.invoiceDate)}</td>
                    <td className="p-3 font-semibold">{inv.transactionType === "Sale" ? inv.customerName : inv.supplierName}</td>
                    <td className="p-3">
                      <Badge tone={inv.transactionType === "Sale" ? "blue" : "grey"}>
                        {inv.transactionType || "Purchase"}
                      </Badge>
                    </td>
                    <td className="p-3 tabular-nums">{formatCurrency(inv.subtotal, inv.currency)}</td>
                    <td className="p-3 tabular-nums">{formatCurrency(inv.vatAmount, inv.currency)}</td>
                    <td className="p-3 text-right font-bold tabular-nums">{formatCurrency(inv.totalAmount, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">No invoices found for this company.</p>
        )}
      </Card>
    </div>
  );
}


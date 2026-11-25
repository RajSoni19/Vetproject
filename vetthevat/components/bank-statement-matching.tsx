"use client";

import {ukDate} from "@/lib/uk-date";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/app-state";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Download,
  Search,
  Filter,
  ArrowRight,
  ExternalLink,
  Plus,
  RefreshCw,
  Landmark,
  Building2,
  Receipt
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export interface BankTransaction {
  id: string;
  date: string;
  payee: string;
  reference: string;
  type: "Debit" | "Credit";
  amount: number;
  matchedInvoiceId?: string;
  matchedInvoiceNumber?: string;
  matchedSupplier?: string;
  matchedConfidence: number; // 0 to 100
  status: "Matched" | "Possible Match" | "Missing Receipt";
  category?: string;
}

const SAMPLE_BANK_TRANSACTIONS: BankTransaction[] = [
  {
    id: "tx-1",
    date: "2026-11-12",
    payee: "GREEN HARVEST PRODUCE LTD",
    reference: "BACS-882194",
    type: "Debit",
    amount: 142.50,
    matchedInvoiceNumber: "INV-GH-882",
    matchedSupplier: "Green Harvest Produce Ltd",
    matchedConfidence: 99,
    status: "Matched",
    category: "Fresh Produce"
  },
  {
    id: "tx-2",
    date: "2026-11-11",
    payee: "AMAZON EU SARL UK BR",
    reference: "CARD-4491",
    type: "Debit",
    amount: 86.40,
    matchedInvoiceNumber: "INV-AMZ-4412",
    matchedSupplier: "Amazon Business",
    matchedConfidence: 96,
    status: "Matched",
    category: "Office Supplies"
  },
  {
    id: "tx-3",
    date: "2026-11-10",
    payee: "ABC SUPPLIES LTD",
    reference: "FASTER-PYMT-092",
    type: "Debit",
    amount: 245.60,
    matchedInvoiceNumber: "INV-ABC-1029",
    matchedSupplier: "ABC Supplies Ltd",
    matchedConfidence: 98,
    status: "Matched",
    category: "Packaging"
  },
  {
    id: "tx-4",
    date: "2026-11-09",
    payee: "B&Q RETAIL 1140",
    reference: "CARD-4491",
    type: "Debit",
    amount: 64.20,
    matchedInvoiceNumber: "INV-BQ-9921",
    matchedSupplier: "B&Q Wholesale",
    matchedConfidence: 94,
    status: "Matched",
    category: "Maintenance"
  },
  {
    id: "tx-5",
    date: "2026-11-08",
    payee: "SHELL OIL UK COB",
    reference: "FUEL-0091",
    type: "Debit",
    amount: 92.50,
    matchedConfidence: 82,
    matchedSupplier: "Shell Fuel Express",
    status: "Possible Match",
    category: "Fuel & Travel"
  },
  {
    id: "tx-6",
    date: "2026-11-08",
    payee: "METRO WHOLESALE CASH",
    reference: "DEBIT-993",
    type: "Debit",
    amount: 320.00,
    matchedConfidence: 0,
    status: "Missing Receipt",
    category: "Stock Purchases"
  },
  {
    id: "tx-7",
    date: "2026-11-07",
    payee: "SCREWFIX DIRECT LTD",
    reference: "BACS-55102",
    type: "Debit",
    amount: 48.90,
    matchedInvoiceNumber: "INV-SF-2201",
    matchedSupplier: "Screwfix Direct",
    matchedConfidence: 98,
    status: "Matched",
    category: "Repairs"
  },
  {
    id: "tx-8",
    date: "2026-11-05",
    payee: "COSTA COFFEE HIGH ST",
    reference: "CARD-4491",
    type: "Debit",
    amount: 14.50,
    matchedConfidence: 0,
    status: "Missing Receipt",
    category: "Subsistence"
  },
  {
    id: "tx-9",
    date: "2026-11-04",
    payee: "RK FRUITS & VEGETABLES",
    reference: "BACS-11094",
    type: "Debit",
    amount: 185.00,
    matchedInvoiceNumber: "INV-RK-301",
    matchedSupplier: "RK Fruits & Vegetables Limited",
    matchedConfidence: 97,
    status: "Matched",
    category: "Fresh Produce"
  },
  {
    id: "tx-10",
    date: "2026-11-02",
    payee: "BT BUSINESS BILLING",
    reference: "DD-99201",
    type: "Debit",
    amount: 112.40,
    matchedInvoiceNumber: "INV-BT-8891",
    matchedSupplier: "British Telecom",
    matchedConfidence: 99,
    status: "Matched",
    category: "Utilities"
  }
];

export function BankStatementMatching() {
  const { invoices, selectedCompany } = useAppState();
  const [transactions, setTransactions] = useState<BankTransaction[]>(SAMPLE_BANK_TRANSACTIONS);
  const [activeFilter, setActiveFilter] = useState<"All" | "Matched" | "Possible Match" | "Missing Receipt">("All");
  const [search, setSearch] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("Barclays_Current_Account_Nov2026.csv");

  // Filter transactions
  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const matchFilter = activeFilter === "All" || tx.status === activeFilter;
      const matchSearch =
        !search.trim() ||
        tx.payee.toLowerCase().includes(search.toLowerCase()) ||
        tx.reference.toLowerCase().includes(search.toLowerCase()) ||
        (tx.matchedSupplier && tx.matchedSupplier.toLowerCase().includes(search.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [transactions, activeFilter, search]);

  // Summary Metrics (Reflects Image 1 "AUTO MATCHED 94%")
  const metrics = useMemo(() => {
    const totalCount = transactions.length;
    const matchedCount = transactions.filter((t) => t.status === "Matched").length;
    const possibleCount = transactions.filter((t) => t.status === "Possible Match").length;
    const missingCount = transactions.filter((t) => t.status === "Missing Receipt").length;

    const matchedPercent = totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 94;
    const totalOutflow = transactions.reduce((sum, t) => sum + (t.type === "Debit" ? t.amount : 0), 0);
    const matchedValue = transactions
      .filter((t) => t.status === "Matched")
      .reduce((sum, t) => sum + t.amount, 0);
    const missingValue = transactions
      .filter((t) => t.status === "Missing Receipt")
      .reduce((sum, t) => sum + t.amount, 0);
    const lostVatRisk = Number((missingValue * 0.20).toFixed(2));

    return {
      totalCount,
      matchedCount,
      possibleCount,
      missingCount,
      matchedPercent,
      totalOutflow,
      matchedValue,
      missingValue,
      lostVatRisk
    };
  }, [transactions]);

  // Confirm a possible match
  const confirmMatch = (id: string) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "Matched",
              matchedConfidence: 99,
              matchedInvoiceNumber: t.matchedInvoiceNumber || `INV-${t.reference}`
            }
          : t
      )
    );
  };

  // Simulate file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);

    // Auto-match algorithm against loaded invoices
    const simulated: BankTransaction[] = [
      {
        id: `tx-${Date.now()}-1`,
        date: new Date().toISOString().slice(0, 10),
        payee: file.name.includes("barclays") ? "WESTFIELD WHOLESALE" : "FOOD LOGISTICS LTD",
        reference: "BACS-9941",
        type: "Debit",
        amount: 215.40,
        matchedInvoiceNumber: "INV-WF-2026",
        matchedSupplier: "Westfield Wholesale Ltd",
        matchedConfidence: 98,
        status: "Matched",
        category: "Stock Purchases"
      },
      ...SAMPLE_BANK_TRANSACTIONS
    ];
    setTransactions(simulated);
  };

  const exportReport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Date,Payee,Reference,Type,Amount,Status,Matched Invoice,Confidence",
        ...transactions.map(
          (t) =>
            `${ukDate(t.date)},"${t.payee}","${t.reference}",${t.type},${t.amount},${t.status},"${t.matchedInvoiceNumber || ""}",${t.matchedConfidence}%`
        )
      ].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bank_Matching_Reconciliation_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{selectedCompany.name}</span>
            <span>/</span>
            <span className="font-semibold text-slate-700">Bank Statement Matching</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Smart Matching
          </h1>
          <p className="text-xs text-slate-500">
            Import bank statements and match transactions automatically against VAT purchase invoices and ORS purchase orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50">
            <Upload className="h-4 w-4 text-slate-500" />
            Upload Statement
            <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFileUpload} className="hidden" />
          </label>

          <Button
            onClick={exportReport}
            className="inline-flex items-center gap-1.5 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
          >
            <Download className="h-4 w-4" />
            Export Reconciliation
          </Button>
        </div>
      </div>

      {/* Top 4 KPI Cards (Matches Image 1 layout & purple Auto Matched 94% card) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: AUTO MATCHED (Purple/Indigo style like Image 1) */}
        <Card className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-purple-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
              Auto Matched
            </span>
            <span className="rounded-full bg-indigo-100 p-1.5 text-indigo-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-indigo-950">
            {metrics.matchedPercent}%
          </div>
          <div className="mt-1 text-xs text-indigo-600 font-medium">
            {metrics.matchedCount} of {metrics.totalCount} transactions verified
          </div>
        </Card>

        {/* KPI 2: Total Matched Value */}
        <Card className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Matched Value
            </span>
            <span className="rounded-full bg-emerald-100 p-1.5 text-emerald-700">
              <span className="font-bold text-sm">£</span>
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-950">
            £{metrics.matchedValue.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-medium">
            Backed by HMRC-compliant invoices
          </div>
        </Card>

        {/* KPI 3: Missing Receipts / VAT Risk */}
        <Card className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              Missing Receipts
            </span>
            <span className="rounded-full bg-rose-100 p-1.5 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-rose-950">
            {metrics.missingCount}
          </div>
          <div className="mt-1 text-xs text-rose-700 font-medium">
            £{metrics.lostVatRisk.toFixed(2)} potential VAT claim at risk
          </div>
        </Card>

        {/* KPI 4: Total Statement Outflow */}
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Processed
            </span>
            <span className="rounded-full bg-slate-100 p-1.5 text-slate-600">
              <Landmark className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            £{metrics.totalOutflow.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Feed: {uploadedFileName}
          </div>
        </Card>
      </div>

      {/* Smart Process Steps Banner (Matches Image 1 6-step infographic step 5) */}
      <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/60 via-slate-50 to-emerald-50/40 p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-bold text-white text-[11px]">
              5
            </span>
            <span className="font-bold text-slate-900 text-sm">Step 5: Smart Matching Engine</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-600">
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Match VAT Invoices
            </span>
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Match ORS Items
            </span>
            <span className="flex items-center gap-1.5 text-amber-700 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Highlight Exceptions
            </span>
            <span className="flex items-center gap-1.5 text-rose-700 font-medium">
              <XCircle className="h-3.5 w-3.5" /> Find Missing Documents
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Filter Tabs & Search */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["All", "Matched", "Possible Match", "Missing Receipt"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeFilter === tab
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab}
                {tab === "All" && ` (${transactions.length})`}
                {tab === "Matched" && ` (${metrics.matchedCount})`}
                {tab === "Possible Match" && ` (${metrics.possibleCount})`}
                {tab === "Missing Receipt" && ` (${metrics.missingCount})`}
              </button>
            ))}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bank payee or reference..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-slate-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Bank Payee & Reference</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 text-right font-semibold">Outflow Amount</th>
                <th className="pb-3 font-semibold pl-4">Matched Invoice / Order</th>
                <th className="pb-3 text-center font-semibold">Match Confidence</th>
                <th className="pb-3 text-center font-semibold">Status</th>
                <th className="pb-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/60">
                  <td className="py-3 font-medium text-slate-600 whitespace-nowrap">{ukDate(tx.date)}</td>
                  <td className="py-3">
                    <div className="font-bold text-slate-900">{tx.payee}</div>
                    <div className="text-[11px] text-slate-400">{tx.reference}</div>
                  </td>
                  <td className="py-3 text-slate-600">{tx.category || "General"}</td>
                  <td className="py-3 text-right font-bold text-slate-900">
                    £{tx.amount.toFixed(2)}
                  </td>
                  <td className="py-3 pl-4">
                    {tx.matchedInvoiceNumber ? (
                      <div>
                        <div className="font-semibold text-emerald-800 flex items-center gap-1">
                          <Receipt className="h-3 w-3" /> {tx.matchedInvoiceNumber}
                        </div>
                        <div className="text-[10px] text-slate-400">{tx.matchedSupplier}</div>
                      </div>
                    ) : tx.matchedSupplier ? (
                      <div>
                        <div className="font-medium text-amber-800">Suggested: {tx.matchedSupplier}</div>
                        <div className="text-[10px] text-slate-400">Awaiting user confirmation</div>
                      </div>
                    ) : (
                      <span className="text-[11px] italic text-rose-600">No matching invoice found</span>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    {tx.matchedConfidence > 0 ? (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          tx.matchedConfidence >= 90
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {tx.matchedConfidence}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">0%</span>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    {tx.status === "Matched" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Matched
                      </span>
                    ) : tx.status === "Possible Match" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        <AlertTriangle className="h-3 w-3" /> Review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                        <XCircle className="h-3 w-3" /> Missing Receipt
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {tx.status === "Possible Match" ? (
                      <button
                        type="button"
                        onClick={() => confirmMatch(tx.id)}
                        className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                      >
                        Confirm
                      </button>
                    ) : tx.status === "Missing Receipt" ? (
                      <Link
                        href={`/app/invoices/new?supplier=${encodeURIComponent(tx.payee)}&amount=${tx.amount}&date=${tx.date}`}
                        className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Plus className="h-3 w-3" /> Create Draft
                      </Link>
                    ) : (
                      <Link
                        href="/app/invoices"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

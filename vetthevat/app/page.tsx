"use client";

import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  ScanLine,
  SearchCheck,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  Smartphone,
  Sparkles,
  Layers,
  ShoppingBag,
  Percent,
  Check,
  Building2,
  UtensilsCrossed,
  Wrench,
  Stethoscope,
  HardHat,
  GraduationCap,
  Sparkle,
  Phone,
  Mail,
  Globe,
  MessageCircle
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ScanSaveClaimGrow } from "@/components/scan-save-claim-grow";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardPreview } from "@/components/product-mockups";
import { UkVatInteractive } from "@/components/uk-vat-interactive";
import { playStoreUrl } from "@/lib/site-links";
import { useLocale } from "@/components/locale-provider";
import Link from "next/link";

export default function HomePage() {
  const { locale, t } = useLocale();

  return (
    <PublicShell>
      <main className="min-w-0 overflow-x-clip bg-white">
        {/* TOP BRAND HERO SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f3f9f6] via-[#f8fbfa] to-white py-12 lg:py-20">
          <div className="container-page">
            {/* Top Ribbon / Floating Badges */}
            <div className="mb-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-emerald-800 shadow-xs">
                <Sparkles className="h-3.5 w-3.5 text-emerald-700" /> SAME BUSINESS · BIGGER POTENTIAL
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/90 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-900 shadow-xs">
                EVERY PENNY HELPS!
              </span>
            </div>

            {/* Dual Brand Header */}
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
              <div className="min-w-0 lg:pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                    <CheckCircle2 className="h-4 w-4" /> VET THE VAT
                  </div>
                  <span className="text-slate-300 font-bold">|</span>
                  <div className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
                    <ShoppingBag className="h-4 w-4" /> ORS (Order Replenishment System)
                  </div>
                </div>

                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                  One Platform. <br />
                  <span className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-amber-700 bg-clip-text text-transparent">
                    Greater Profits.
                  </span>
                </h1>

                <p className="mt-3 text-xl font-bold text-slate-700">
                  Recover More VAT. <span className="text-amber-700">Buy Smarter.</span> Grow Faster.
                </p>

                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                  The all-in-one platform for automated VAT receipt management, HMRC-compliant record keeping, and intelligent supplier price comparisons with 10–12 week price increase alerts.
                </p>

                {/* Key Benefits Horizontal Ticker */}
                <div className="mt-6 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700 sm:grid-cols-3">
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Claim More VAT
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> Reduce Purchasing Costs
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Never Lose Another Receipt
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> Automate Ordering
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Full Audit & HMRC Ready
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> Complete Visibility
                  </div>
                </div>

                {/* Primary CTAs */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink
                    href="/get-started"
                    className="bg-emerald-700 px-6 py-3 font-bold text-white hover:bg-emerald-800 shadow-md"
                  >
                    Book A Demo Today <ArrowRight className="h-4 w-4" />
                  </ButtonLink>

                  <ButtonLink
                    href="/app/invoices/upload"
                    variant="outline"
                    className="border-slate-300 font-semibold"
                  >
                    Try Invoice Upload
                  </ButtonLink>

                  <ButtonLink
                    href="/app/ors/prices"
                    variant="outline"
                    className="border-amber-300 bg-amber-50/50 font-semibold text-amber-950 hover:bg-amber-100"
                  >
                    View Price Comparison
                  </ButtonLink>
                </div>
              </div>

              {/* Mockup Preview Area: Fully responsive without overlapping text or clipped mockups */}
              <div className="min-w-0">
                <div className="w-full rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-xl sm:p-3">
                  <DashboardPreview />
                </div>
              </div>
            </div>

          </div>
        </section>

        <ScanSaveClaimGrow />

        {/* 6-STEP WORKFLOW INFOGRAPHIC SECTION (From Poster Image 1 & 3) */}
        <section className="border-y border-slate-200 bg-[#f8fbfa] py-16">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-800">
                End-to-End Workflow
              </span>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">
                How It Works: 6 Simple Steps
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                From capture to purchasing intelligence and HMRC tax claims, everything happens seamlessly.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {/* Step 1: Capture */}
              <Card className="flex flex-col justify-between border-emerald-200 bg-white p-4 shadow-sm hover:border-emerald-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-extrabold text-white">
                      1
                    </span>
                    <Camera className="h-4 w-4 text-emerald-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-emerald-950">
                    Capture
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Scan receipts and invoices from anywhere.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Camera</li>
                  <li className="flex items-center gap-1.5">✓ PDF Uploads</li>
                  <li className="flex items-center gap-1.5">✓ Gallery Import</li>
                </ul>
              </Card>

              {/* Step 2: Smart Extraction */}
              <Card className="flex flex-col justify-between border-emerald-200 bg-white p-4 shadow-sm hover:border-emerald-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-extrabold text-white">
                      2
                    </span>
                    <ScanLine className="h-4 w-4 text-emerald-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-emerald-950">
                    Smart Extraction
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    AI extracts and organises line item details.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Supplier Info</li>
                  <li className="flex items-center gap-1.5">✓ VAT Amounts</li>
                  <li className="flex items-center gap-1.5">✓ Items Purchased</li>
                  <li className="flex items-center gap-1.5">✓ Dates & Values</li>
                </ul>
              </Card>

              {/* Step 3: Vet The Vat */}
              <Card className="flex flex-col justify-between border-emerald-200 bg-white p-4 shadow-sm hover:border-emerald-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-extrabold text-white">
                      3
                    </span>
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-emerald-950">
                    Vet The Vat
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Validate, organise and prepare for VAT claims.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ HMRC Compliant</li>
                  <li className="flex items-center gap-1.5">✓ Secure Storage</li>
                  <li className="flex items-center gap-1.5">✓ VAT Verification</li>
                  <li className="flex items-center gap-1.5">✓ Full Audit Trail</li>
                </ul>
              </Card>

              {/* Step 4: Build Purchasing Intelligence */}
              <Card className="flex flex-col justify-between border-amber-200 bg-white p-4 shadow-sm hover:border-amber-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-xs font-extrabold text-white">
                      4
                    </span>
                    <Layers className="h-4 w-4 text-amber-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-amber-950">
                    Purchasing Intel
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Every purchase builds your product database.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Product Library</li>
                  <li className="flex items-center gap-1.5">✓ Supplier Tracking</li>
                  <li className="flex items-center gap-1.5">✓ Purchase History</li>
                  <li className="flex items-center gap-1.5">✓ Buying Trends</li>
                </ul>
              </Card>

              {/* Step 5: Smart Matching */}
              <Card className="flex flex-col justify-between border-indigo-200 bg-white p-4 shadow-sm hover:border-indigo-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-extrabold text-white">
                      5
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-indigo-950">
                    Smart Matching
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Import bank statements and match transactions.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Match VAT Invoices</li>
                  <li className="flex items-center gap-1.5">✓ Match ORS Items</li>
                  <li className="flex items-center gap-1.5">✓ Highlight Exceptions</li>
                  <li className="flex items-center gap-1.5">✓ Missing Documents</li>
                </ul>
              </Card>

              {/* Step 6: Better Decisions */}
              <Card className="flex flex-col justify-between border-amber-200 bg-white p-4 shadow-sm hover:border-amber-400 transition-all">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-xs font-extrabold text-white">
                      6
                    </span>
                    <TrendingUp className="h-4 w-4 text-amber-600" />
                  </div>
                  <h3 className="mt-3 text-sm font-extrabold uppercase tracking-wide text-amber-950">
                    Better Decisions
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Actionable insights to grow your profitability.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Create Orders Faster</li>
                  <li className="flex items-center gap-1.5">✓ Price Alerts</li>
                  <li className="flex items-center gap-1.5">✓ Lower Costs</li>
                  <li className="flex items-center gap-1.5">✓ Greater Profits</li>
                </ul>
              </Card>
            </div>
          </div>
        </section>

        {/* TWO PILLARS SIDE-BY-SIDE SECTION */}
        <section className="py-16">
          <div className="container-page">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Pillar 1: VET THE VAT */}
              <Card className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white">
                    PILLAR 1
                  </span>
                  <span className="text-xs font-bold text-emerald-800">
                    HMRC READY
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-extrabold text-emerald-950">
                  VET THE VAT — Maximise Your Claims
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Capture every receipt and invoice. Never miss a single penny of reclaimable input VAT.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Claim every penny of VAT you're entitled to",
                    "Never lose another paper receipt or digital PDF",
                    "HMRC compliant digital audit trail & Making Tax Digital support",
                    "Secure encrypted cloud storage with instant search",
                    "Export to accountants with clickable original invoice links",
                    "Multi-company support with granular staff roles"
                  ].map((benefit) => (
                    <div key={benefit} className="flex items-start gap-2.5 text-xs font-semibold text-slate-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-4 border-t border-emerald-100 flex items-center justify-between">
                  <Link
                    href="/app/invoices/upload"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
                  >
                    Open VAT Workspace <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <span className="text-[11px] font-bold text-emerald-700">Safe. Secure. Compliant.</span>
                </div>
              </Card>

              {/* Pillar 2: ORS */}
              <Card className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/40 to-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white">
                    PILLAR 2
                  </span>
                  <span className="text-xs font-bold text-amber-800">
                    PURCHASING INTEL
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-extrabold text-amber-950">
                  ORS — Order Replenishment System
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Compare multi-supplier prices, automate grouped purchase orders, and monitor 10–12 week price inflation.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Create and dispatch purchase orders in seconds",
                    "Compare multiple supplier quotes side-by-side with Cheapest badges",
                    "Automatic 10–12 week price increase alerts (>7–10% threshold)",
                    "Group order lists by supplier automatically with one-click PO generation",
                    "Full SKU and pack size price history tracking",
                    "Direct savings recommendations: Save up to 16% on regular stock"
                  ].map((benefit) => (
                    <div key={benefit} className="flex items-start gap-2.5 text-xs font-semibold text-slate-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-4 border-t border-amber-100 flex items-center justify-between">
                  <Link
                    href="/app/ors/prices"
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-amber-950"
                  >
                    Explore Price Comparison <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <span className="text-[11px] font-bold text-amber-700">Better Prices. Higher Profits.</span>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* WORKS FOR ALL BUSINESSES SECTION (From Poster) */}
        <section className="bg-slate-50 py-16">
          <div className="container-page text-center">
            <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Works For All UK Businesses
            </h2>
            <p className="mt-2 text-xs text-slate-500">
              Tailored workflows for sectors managing supplier invoices, trade purchases, and regular replenishments.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              {[
                { label: "Retail", icon: ShoppingBag, color: "bg-emerald-100 text-emerald-800" },
                { label: "Hospitality", icon: UtensilsCrossed, color: "bg-blue-100 text-blue-800" },
                { label: "Trades", icon: Wrench, color: "bg-amber-100 text-amber-800" },
                { label: "Offices", icon: Building2, color: "bg-purple-100 text-purple-800" },
                { label: "Healthcare", icon: Stethoscope, color: "bg-rose-100 text-rose-800" },
                { label: "Construction", icon: HardHat, color: "bg-orange-100 text-orange-800" },
                { label: "Education", icon: GraduationCap, color: "bg-indigo-100 text-indigo-800" },
                { label: "Beauty & Wellness", icon: Sparkle, color: "bg-teal-100 text-teal-800" }
              ].map((sector) => {
                const Icon = sector.icon;
                return (
                  <div
                    key={sector.label}
                    className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${sector.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="mt-2 text-xs font-bold text-slate-800">{sector.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* UK VAT INTERACTIVE WIDGET */}
        <UkVatInteractive />

        {/* BOTTOM CALL TO ACTION (Matches poster footer) */}
        <section className="bg-gradient-to-r from-emerald-900 via-emerald-950 to-slate-950 py-16 text-white">
          <div className="container-page text-center">
            <span className="font-serif italic text-emerald-300 text-lg">
              "Every receipt is a financial asset. Don't lose it."
            </span>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-5xl">
              Smarter Businesses Claim More VAT.
            </h2>
            <p className="mt-4 mx-auto max-w-xl text-sm leading-relaxed text-emerald-200">
              Join thousands of UK businesses saving time, preventing missed VAT claims, and cutting purchasing costs with Vet the VAT and ORS.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <ButtonLink
                href="/get-started"
                className="bg-emerald-500 px-8 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 shadow-lg"
              >Get Started Today <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                className="border-emerald-700 bg-white/10 text-white hover:bg-white/20"
              >
                <Download className="h-4 w-4" /> Download Mobile App
              </ButtonLink>
            </div>

            {/* Direct Contact Bar (From Poster) */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 border-t border-emerald-800/80 pt-8 text-xs font-semibold text-emerald-300">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-400" /> <a href="tel:+447306361031" className="hover:text-white">07306 361031</a>
              </div>
              <a href="https://wa.me/447306361031?text=Hi%20VET%20THE%20VAT%2C%20I%27d%20like%20a%20demo" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-slate-950 hover:bg-emerald-400">
                <MessageCircle className="h-4 w-4" /> WhatsApp us
              </a>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-400" /> <a href="mailto:vetthevat@gmail.com" className="hover:text-white">vetthevat@gmail.com</a>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-emerald-400" /> web.vetthevat.com
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

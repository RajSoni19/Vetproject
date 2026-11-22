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
                <Sparkles className="h-3.5 w-3.5 text-emerald-700" /> Built for UK businesses
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/90 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-900 shadow-xs">
                VAT and purchasing in one place
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
                  Claim more VAT. <span className="text-amber-700">Buy smarter.</span> Grow faster.
                </p>

                <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">
                  One place to capture invoices and receipts, keep your VAT records ready for your accountant, and compare supplier prices, with alerts when prices change.
                </p>

                {/* Key Benefits Horizontal Ticker */}
                <div className="mt-6 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700 sm:grid-cols-3">
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Claim the VAT you're owed
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> Lower purchasing costs
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Never lose a receipt
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> Order in a few clicks
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Records ready for your accountant
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-900">
                    <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" /> See all your spending
                  </div>
                </div>

                {/* Primary CTAs */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink
                    href="/get-started"
                    className="bg-emerald-700 px-6 py-3 font-bold text-white hover:bg-emerald-800 shadow-md"
                  >
                    Book a demo <ArrowRight className="h-4 w-4" />
                  </ButtonLink>

                  <ButtonLink
                    href="/app/invoices/upload"
                    variant="outline"
                    className="border-slate-300 font-semibold"
                  >
                    Try invoice upload
                  </ButtonLink>

                  <ButtonLink
                    href="/app/ors/prices"
                    variant="outline"
                    className="border-amber-300 bg-amber-50/50 font-semibold text-amber-950 hover:bg-amber-100"
                  >
                    View price comparison
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
                How it works
              </span>
              <h2 className="mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl">
                Six simple steps
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                From scanning an invoice to claiming VAT and buying better, all in one place.
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
                    Scan invoices and receipts wherever you are.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Camera</li>
                  <li className="flex items-center gap-1.5">✓ PDF upload</li>
                  <li className="flex items-center gap-1.5">✓ Photo library</li>
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
                    Automatic reading
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Supplier, date, items and VAT are read for you.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Supplier details</li>
                  <li className="flex items-center gap-1.5">✓ VAT amounts</li>
                  <li className="flex items-center gap-1.5">✓ Items purchased</li>
                  <li className="flex items-center gap-1.5">✓ Dates and totals</li>
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
                    Check the VAT
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Review each invoice and keep it ready for your VAT return.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Digital records</li>
                  <li className="flex items-center gap-1.5">✓ Secure storage</li>
                  <li className="flex items-center gap-1.5">✓ VAT number checks</li>
                  <li className="flex items-center gap-1.5">✓ Full change history</li>
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
                    Purchasing insights
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Every invoice builds your product price list.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Product list</li>
                  <li className="flex items-center gap-1.5">✓ Supplier tracking</li>
                  <li className="flex items-center gap-1.5">✓ Purchase history</li>
                  <li className="flex items-center gap-1.5">✓ Buying trends</li>
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
                    Bank matching
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Upload a bank statement and match each payment to its invoice.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Payments matched to invoices</li>
                  <li className="flex items-center gap-1.5">✓ VAT added automatically</li>
                  <li className="flex items-center gap-1.5">✓ Differences flagged</li>
                  <li className="flex items-center gap-1.5">✓ Missing invoices found</li>
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
                    Better decisions
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Clear insights that help you spend less.
                  </p>
                </div>
                <ul className="mt-4 space-y-1 text-[11px] font-medium text-slate-700">
                  <li className="flex items-center gap-1.5">✓ Faster ordering</li>
                  <li className="flex items-center gap-1.5">✓ Price alerts</li>
                  <li className="flex items-center gap-1.5">✓ Lower costs</li>
                  <li className="flex items-center gap-1.5">✓ Higher profits</li>
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
                    VAT
                  </span>
                  <span className="text-xs font-bold text-emerald-800">
                    Ready for your VAT return
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-extrabold text-emerald-950">
                  VET THE VAT: claim what you're owed
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Capture every invoice and receipt so no reclaimable VAT is missed.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Claim all the VAT you're entitled to",
                    "Keep every receipt and PDF invoice in one place",
                    "Digital records with a full change history",
                    "Secure online records with quick search",
                    "Excel exports for your accountant, with a link to each invoice",
                    "Several companies in one account, with staff roles"
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
                    Open VAT workspace <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <span className="text-[11px] font-bold text-emerald-700">Secure and organised.</span>
                </div>
              </Card>

              {/* Pillar 2: ORS */}
              <Card className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/40 to-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white">
                    Purchasing
                  </span>
                  <span className="text-xs font-bold text-amber-800">
                    Buy smarter
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-extrabold text-amber-950">
                  ORS: Order Replenishment System
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Compare supplier prices, send orders by WhatsApp or email, and track price changes over the last 12 weeks.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Create and send purchase orders in seconds",
                    "Compare supplier prices side by side, with the cheapest highlighted",
                    "Alerts when a price changes by 10% or more",
                    "Orders grouped by supplier automatically",
                    "Price history for every product and pack size",
                    "See how much you could save on each product"
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
                    Explore price comparison <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <span className="text-[11px] font-bold text-amber-700">Better prices, higher profits.</span>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* WORKS FOR ALL BUSINESSES SECTION (From Poster) */}
        <section className="bg-slate-50 py-16">
          <div className="container-page text-center">
            <h2 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
              Built for UK businesses of every kind
            </h2>
            <p className="mt-2 text-xs text-slate-500">
              For any business that buys from suppliers and reorders regularly.
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
              Smarter businesses claim more VAT.
            </h2>
            <p className="mt-4 mx-auto max-w-xl text-sm leading-relaxed text-emerald-200">
              Save time, stop missing VAT claims and cut purchasing costs with VET THE VAT and ORS.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <ButtonLink
                href="/get-started"
                className="bg-emerald-500 px-8 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 shadow-lg"
              >Get started <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                className="border-emerald-700 bg-white/10 text-white hover:bg-white/20"
              >
                <Download className="h-4 w-4" /> Download the app
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

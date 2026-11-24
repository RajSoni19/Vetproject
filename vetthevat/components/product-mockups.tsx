"use client";

import { Card } from "@/components/ui/card";
import { 
  Receipt, 
  TrendingUp, 
  CheckCircle2, 
  ShoppingCart, 
  Camera, 
  ArrowUpRight,
  Building2
} from "lucide-react";

export function DashboardPreview() {
  return (
    <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-lg">
      {/* Top Browser / App Window Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 font-mono text-[11px] text-slate-600">vetthevat.com/dashboard</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Platform
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {/* Workspace Brand Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-wider text-[#0F7A3A]">VET THE VAT</span>
              <span className="text-xs text-slate-300">|</span>
              <span className="text-xs font-black tracking-wider text-[#0F7A3A]">ORS</span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Dashboard Overview</h3>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#0F7A3A]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            VAT ready
          </div>
        </div>

        {/* 4 Poster KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 2xl:grid-cols-4">
          <div className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-800">VAT Found</span>
              <Receipt className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <p className="mt-1 text-base font-extrabold text-emerald-950 tabular-nums leading-tight whitespace-nowrap sm:text-lg lg:text-base xl:text-lg 2xl:text-base">£14,862.37</p>
            <p className="mt-0.5 flex items-center text-[10px] font-medium text-emerald-700">
              <ArrowUpRight className="mr-0.5 h-3 w-3" /> +12% vs last qtr
            </p>
          </div>

          <div className="min-w-0 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-800">ORS Savings</span>
              <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <p className="mt-1 text-base font-extrabold text-amber-950 tabular-nums leading-tight whitespace-nowrap sm:text-lg lg:text-base xl:text-lg 2xl:text-base">£3,842.00</p>
            <p className="mt-0.5 text-[10px] font-medium text-amber-700">Lower supplier costs</p>
          </div>

          <div className="min-w-0 rounded-xl border border-purple-100 bg-purple-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-800">Auto Matched</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <p className="mt-1 text-base font-extrabold text-purple-950 tabular-nums leading-tight whitespace-nowrap sm:text-lg lg:text-base xl:text-lg 2xl:text-base">94%</p>
            <p className="mt-0.5 text-[10px] font-medium text-purple-700">332 of 351 txns</p>
          </div>

          <div className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-800">Total Orders</span>
              <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <p className="mt-1 text-base font-extrabold text-blue-950 tabular-nums leading-tight whitespace-nowrap sm:text-lg lg:text-base xl:text-lg 2xl:text-base">28</p>
            <p className="mt-0.5 text-[10px] font-medium text-blue-700">Sent this month</p>
          </div>
        </div>

        {/* Lower Grid: Purchases Chart + Top Suppliers */}
        <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-5">
          {/* Simulated Monthly Purchases Bar Chart */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 2xl:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <span className="font-bold text-slate-900">Monthly Purchases</span>
              <div className="flex flex-wrap items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 font-medium text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" /> VAT Related
                </span>
                <span className="flex items-center gap-1 font-medium text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> ORS Orders
                </span>
              </div>
            </div>

            {/* Bars */}
            <div className="mt-3 flex h-28 items-end justify-between gap-1.5 overflow-hidden pt-2">
              {[
                { m: "Jun", vat: 65, ors: 35 },
                { m: "Jul", vat: 75, ors: 45 },
                { m: "Aug", vat: 60, ors: 40 },
                { m: "Sep", vat: 85, ors: 55 },
                { m: "Oct", vat: 90, ors: 60 },
                { m: "Nov", vat: 95, ors: 70 },
              ].map((item) => (
                <div key={item.m} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full max-w-[28px] flex-col gap-0.5">
                    <div 
                      className="w-full rounded-t bg-emerald-600 transition-all" 
                      style={{ height: `${item.vat * 0.55}px` }} 
                    />
                    <div 
                      className="w-full rounded-b bg-amber-500 transition-all" 
                      style={{ height: `${item.ors * 0.4}px` }} 
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-600">{item.m}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Suppliers List */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 2xl:col-span-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900">
              <span>Top Suppliers</span>
              <span className="text-[10px] font-normal text-slate-600">Orders</span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {[
                { name: "Amazon Business", count: 28, color: "bg-amber-100 text-amber-800" },
                { name: "Office Depot", count: 24, color: "bg-red-100 text-red-800" },
                { name: "B&Q Trade", count: 18, color: "bg-orange-100 text-orange-800" },
                { name: "Shell Fuel", count: 15, color: "bg-yellow-100 text-yellow-800" },
                { name: "Screwfix Direct", count: 12, color: "bg-blue-100 text-blue-800" },
              ].map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    <Building2 className="h-3 w-3 text-slate-600" />
                    {s.name}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.color}`}>
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function PhonePreview() {
  return (
    <div className="phone-frame mx-auto w-full max-w-[240px] rounded-[32px] border-4 border-slate-900 bg-white p-3.5 shadow-2xl">
      {/* Top Phone Speaker / Camera Notch */}
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-200" />

      <div className="rounded-2xl bg-emerald-50/60 p-3 text-center">
        <p className="text-[10px] font-black uppercase tracking-wider text-[#0F7A3A]">
          VET THE VAT
        </p>
        <h4 className="mt-1 text-sm font-extrabold text-slate-900">
          Scan. Upload. Done!
        </h4>

        {/* Receipt Visual Card */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5 text-left shadow-sm">
          <p className="border-b border-dashed border-slate-200 pb-1 text-center font-mono text-[10px] font-bold text-slate-600">
            ANY SUPPLIER RECEIPT
          </p>
          <div className="mt-2 space-y-1 font-mono text-[10px]">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>£20.00</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>VAT (20%):</span>
              <span className="font-semibold text-emerald-800">£4.00</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-1 font-bold text-slate-900">
              <span>Total:</span>
              <span>£24.00</span>
            </div>
          </div>
        </div>

        {/* Big Action Camera Button */}
        <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#0F7A3A] py-2 text-xs font-bold text-white shadow hover:bg-[#0c622e]">
          <Camera className="h-3.5 w-3.5" />
          <span>Snap Receipt</span>
        </div>
      </div>
    </div>
  );
}

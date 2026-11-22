"use client";
// "Scan. Save. Claim. Grow." — the four-step story from the client brief, as an
// animated process. Steps light up in turn; with reduced motion they are static.
import { useEffect, useState } from "react";
import { Camera, CloudUpload, Receipt, TrendingUp } from "lucide-react";

const steps = [
  { icon: Camera, title: "Scan", text: "Take a photo or upload a PDF of any invoice or receipt." },
  { icon: CloudUpload, title: "Save", text: "Supplier, date, net, VAT and total are read for you and saved securely." },
  { icon: Receipt, title: "Claim", text: "Organised VAT records and a clean Excel export for your accountant." },
  { icon: TrendingUp, title: "Grow", text: "Compare supplier prices, get price alerts and order at the best price." }
];

export function ScanSaveClaimGrow() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive(step => (step + 1) % steps.length), 1800);
    return () => window.clearInterval(timer);
  }, []);
  return <section aria-labelledby="ssc-title" className="bg-white py-16">
    <div className="mx-auto max-w-6xl px-4">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-emerald-700">How it works</p>
      <h2 id="ssc-title" className="mt-2 text-center text-3xl font-extrabold text-slate-950 sm:text-5xl">Scan. Save. Claim. Grow.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Capture every receipt. Claim every penny of VAT. Buy smarter from the cheapest supplier.</p>
      <ol className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* progress line behind the steps on wide screens */}
        <div aria-hidden className="absolute left-[12%] right-[12%] top-9 hidden h-1 rounded-full bg-slate-200 lg:block">
          <div className="h-1 rounded-full bg-emerald-500 transition-all duration-700 ease-out motion-reduce:transition-none" style={{ width: `${(active / (steps.length - 1)) * 100}%` }} />
        </div>
        {steps.map(({ icon: Icon, title, text }, index) => {
          const on = index <= active;
          return <li key={title} className={`relative rounded-2xl border p-5 text-center transition-all duration-500 motion-reduce:transition-none ${index === active ? "-translate-y-1 border-emerald-400 bg-emerald-50 shadow-lg" : "border-slate-200 bg-white"}`}>
            <span className={`relative z-10 mx-auto grid h-14 w-14 place-items-center rounded-full transition-colors duration-500 ${on ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
              <Icon className={`h-7 w-7 ${index === active ? "motion-safe:animate-bounce" : ""}`} aria-hidden />
            </span>
            <p className="mt-3 text-xs font-bold text-emerald-700">Step {index + 1}</p>
            <h3 className="text-xl font-extrabold text-slate-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
          </li>;
        })}
      </ol>
    </div>
  </section>;
}

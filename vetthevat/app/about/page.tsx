import { Download } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { playStoreUrl } from "@/lib/site-links";

export const metadata = {
  title: "About",
  description: "Learn about VET THE VAT and the goal of simplifying business VAT and invoicing management."
};

export default function AboutPage() {
  return (
    <PublicShell>
      <main>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">About VET THE VAT</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">A UK-based platform for clearer invoice and VAT records.</h1>
            <p className="mt-6 text-lg leading-8 text-muted">
              VET THE VAT is a business-focused record-management product from VETTING THE VAT LTD. The platform direction is simple: help UK businesses, accountants, bookkeepers and finance teams keep invoice, VAT, supplier and company information organised in one accessible workspace.
            </p>
          </div>
        </section>
        <section className="py-20">
          <div className="container-page grid gap-6 md:grid-cols-2">
            <Card className="p-8">
              <h2 className="text-2xl font-bold">Our Mission</h2>
              <p className="mt-4 leading-7 text-muted">To simplify UK invoice processing and VAT review with clear workflows, useful records, and tools that work across phone and browser.</p>
            </Card>
            <Card className="p-8">
              <h2 className="text-2xl font-bold">Product Philosophy</h2>
              <div className="mt-5 grid gap-3 text-muted">
                {["Simple.", "Clear.", "Accessible.", "Business-focused."].map((item) => <p key={item}>{item}</p>)}
              </div>
            </Card>
          </div>
        </section>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page">
            <h2 className="text-4xl font-bold">Why VET THE VAT</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {["Complicated processes", "Scattered information", "Manual invoice management", "Difficulty tracking VAT", "Reporting overhead", "Document organisation"].map((item) => (
                <Card key={item} className="p-6">
                  <h3 className="font-bold">{item}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">The platform aims to replace fragmented admin with structured records and practical workflows.</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
        <section className="py-16">
          <div className="container-page flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-bold">Ready to explore VET THE VAT?</h2>
              <p className="mt-2 text-muted">Explore the product information or download the verified Android app.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/mobile-app">Explore mobile app</ButtonLink>
              <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="outline"><Download className="h-4 w-4" />Download App</ButtonLink>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

import { Building2, Download, FileSpreadsheet, FileText, Landmark, ReceiptText, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { playStoreUrl } from "@/lib/site-links";

export const metadata = {
  title: "Features",
  description: "VET THE VAT features: automatic invoice reading, VAT checks, bank VAT matching, Excel exports and reporting."
};

const features = [
  ["Automatic invoice reading", "Scan a PDF or photo and the supplier, date, items and VAT are read for you.", FileText],
  ["Company and supplier records", "Every invoice is filed under the right company and supplier, with a full price history.", Building2],
  ["VAT validation", "UK VAT numbers are checked automatically, with a one-click link to HMRC's official checker.", ReceiptText],
  ["Bank VAT matching", "Upload a bank statement and each payment is matched to its invoice, with the VAT added for you.", Landmark],
  ["Excel and PDF exports", "Download your invoices to Excel or PDF, ready to send to your accountant.", FileSpreadsheet],
  ["Period-based reporting", "See and download figures by month, quarter, year or your own dates.", Download],
  ["Security and data protection", "Each company's data is private, connections are encrypted and every change is recorded.", ShieldCheck]
];

export default function FeaturesPage() {
  return (
    <PublicShell>
      <main>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">Features</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">Everything you need for invoices and VAT</h1>
            <p className="mt-6 text-lg leading-8 text-muted">Everything you need to capture invoices, check VAT and keep your records ready for your accountant.</p>
          </div>
        </section>
        <section className="py-20">
          <div className="container-page grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([title, description, Icon]) => (
              <Card key={title as string} className="p-6">
                <div className="grid h-12 w-12 place-items-center rounded-md bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-5 text-xl font-bold">{title as string}</h2>
                <p className="mt-3 text-sm leading-6 text-muted">{description as string}</p>
              </Card>
            ))}
          </div>
        </section>
        <section className="bg-ink py-16 text-white">
          <div className="container-page flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-bold">Ready to get started?</h2>
              <p className="mt-2 text-white/75">Book a demo or download the Android app.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/get-started" className="bg-white text-ink hover:bg-brand-50">Get started</ButtonLink>
              <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white hover:text-ink"><Download className="h-4 w-4" />Download the app</ButtonLink>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

import { Building2, Download, FileSpreadsheet, FileText, Mail, ReceiptText, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { playStoreUrl } from "@/lib/site-links";

export const metadata = {
  title: "Features",
  description: "Core Vet the VAT features for data extraction, suppliers, VAT validation, email sharing, exports and reporting."
};

const features = [
  ["Easy data extraction", "Reduce manual entry by extracting invoice information into structured records.", FileText],
  ["Company and supplier records", "Organise captured invoice data around the appropriate company and supplier.", Building2],
  ["VAT validation", "Review supplier VAT registration details through supported validation services.", ReceiptText],
  ["Email sharing", "Send processed invoices or records to designated email addresses, where supported.", Mail],
  ["Excel and PDF exports", "Download supported formats for reporting and further processing.", FileSpreadsheet],
  ["Period-based reporting", "Compile records for monthly, quarterly and annual reporting periods.", Download],
  ["Security and data protection", "Protect business and invoice information with verified controls before making production claims.", ShieldCheck]
];

export default function FeaturesPage() {
  return (
    <PublicShell>
      <main>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">Features</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">Core features for invoice data and VAT workflows.</h1>
            <p className="mt-6 text-lg leading-8 text-muted">A focused feature set for capturing invoice information, validating supplier VAT details where supported, and exporting organised records.</p>
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
              <p className="mt-2 text-white/75">Explore the product information or download the verified Android app.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/get-started" className="bg-white text-ink hover:bg-brand-50">Get Started</ButtonLink>
              <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white hover:text-ink"><Download className="h-4 w-4" />Download App</ButtonLink>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

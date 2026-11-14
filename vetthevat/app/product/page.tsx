import { BadgeCheck, FileSpreadsheet, FileText, Smartphone, Upload } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Product",
  description: "Explore the Vet the VAT platform for invoice capture, line item extraction, VAT validation and reporting."
};

const productFeatures = [
  {
    title: "Capture invoices your way.",
    label: "Invoice capture",
    body: "Bring invoice information into one place using a convenient capture process.",
    icon: Upload,
    items: [
      "Upload invoice files from a computer.",
      "Capture an invoice or receipt using a mobile phone.",
      "Scan paper documents.",
      "Support multiple document formats, subject to accepted file types.",
      "Organise captured documents under the relevant company and supplier."
    ],
    cta: "Explore the mobile app"
  },
  {
    title: "Turn invoice documents into structured data.",
    label: "Individual item extraction",
    body: "Vet the VAT is designed to extract information from invoices and present it in an organised, reviewable format.",
    icon: FileText,
    items: [
      "Supplier and invoice information.",
      "Item descriptions and line-level values.",
      "Net amounts, VAT amounts and gross totals.",
      "Reviewable fields that can be corrected before use.",
      "The actual fields depend on the extraction engine and supported invoice layouts."
    ],
    cta: "Explore the mobile app"
  },
  {
    title: "Add an extra layer of confidence to supplier checks.",
    label: "VAT validation",
    body: "Help users review supplier VAT registration information as part of the invoice processing workflow.",
    icon: BadgeCheck,
    items: [
      "Identify the supplier VAT number from the invoice.",
      "Submit the VAT number to an appropriate verification service, where supported.",
      "Display returned registration status and relevant verification details.",
      "Record the check date and result where the integration supports it.",
      "Flag missing, invalid or inconclusive results for manual review."
    ],
    cta: "Explore the mobile app"
  },
  {
    title: "Your invoice data, ready for reporting.",
    label: "Reporting and export",
    body: "Help users convert captured invoice information into structured records that can be reviewed and downloaded.",
    icon: FileSpreadsheet,
    items: [
      "Export invoice records to Excel and PDF, where supported.",
      "Compile data by month, quarter or year.",
      "Filter records by company, supplier or reporting period.",
      "Share invoice records through email.",
      "Provide net, VAT and gross totals in exported reports."
    ],
    cta: "Explore the mobile app"
  }
];

const ukWorkflow = [
  ["Capture UK supplier invoices", "Store the invoice file and the extracted fields together so source documents remain easy to find."],
  ["Review VAT numbers", "Surface supplier VAT numbers for checking through supported UK or EU verification services."],
  ["Prepare period summaries", "Group reviewed records by month, quarter or year to support bookkeeping and VAT return preparation."],
  ["Export for advisers", "Download structured records for accountants, bookkeepers or internal finance review where exports are enabled."]
];

export default function ProductPage() {
  return (
    <PublicShell>
      <main>
        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page max-w-4xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">Product</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">Explore the Vet the VAT platform.</h1>
            <p className="mt-6 text-lg leading-8 text-muted">A simple platform for capturing invoices, extracting structured financial information and preparing records for reporting.</p>
          </div>
        </section>

        <section className="py-20">
          <div className="container-page grid gap-6">
            {productFeatures.map((feature) => (
              <Card key={feature.label} className="grid gap-8 p-8 lg:grid-cols-[0.75fr_1.25fr]">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-md bg-brand-50 text-brand-700">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-brand-700">{feature.label}</p>
                  <h2 className="mt-3 text-3xl font-bold leading-tight">{feature.title}</h2>
                  <p className="mt-4 leading-7 text-muted">{feature.body}</p>
                  <ButtonLink href="/mobile-app" className="mt-6">{feature.cta}</ButtonLink>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {feature.items.map((item) => (
                    <div key={item} className="rounded-lg border border-line bg-wash p-4 text-sm leading-6 text-muted">{item}</div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="bg-[#f8fbfa] py-20">
          <div className="container-page">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">UK workflow details</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-bold leading-tight">More than capture: a reviewable record from document to report.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {ukWorkflow.map(([title, body]) => (
                <Card key={title} className="p-6">
                  <h3 className="text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">{body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-ink py-16 text-white">
          <div className="container-page flex flex-col gap-4">
            <Smartphone className="h-8 w-8 text-brand-200" />
            <h2 className="text-3xl font-bold">Important VAT validation note</h2>
            <p className="max-w-4xl text-sm leading-7 text-white/75">
              A VAT registration check does not by itself confirm that an invoice is genuine, that the supply took place, or that input VAT is recoverable. Verification availability and returned information may differ between UK and EU jurisdictions.
            </p>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

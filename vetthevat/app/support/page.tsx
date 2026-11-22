import { SimplePublicPage } from "@/components/public-pages";

export default function PublicSupportPage() {
  return <SimplePublicPage eyebrow="Support" title="How can we help?" description="Guides for the most common tasks, from your first invoice to sending figures to your accountant." sections={[
    { title: "Add your first invoice", body: "Choose Upload & OCR, then take a photo or upload the PDF. Check the details that were read, then save the invoice." },
    { title: "Check the VAT", body: "Each line shows its VAT rate. The app warns you if the totals do not match the invoice, so you can correct them before saving." },
    { title: "Match bank payments", body: "Upload your bank statement in Bank Matching. Each payment is matched to its invoice and the VAT is added automatically." },
    { title: "Send figures to your accountant", body: "Download confirmed invoices to Excel by month, quarter, year or custom dates. Each row links back to its invoice." },
    { title: "Questions about your account", body: "Contact us about plans, pricing, adding companies or getting started." },
    { title: "Please note", body: "VET THE VAT keeps your records organised. It does not give tax advice, so please check with your accountant where needed." }
  ]} />;
}

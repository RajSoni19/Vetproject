import { SimplePublicPage } from "@/components/public-pages";

export default function FaqPage() {
  return <SimplePublicPage eyebrow="FAQ" title="Frequently asked questions" description="Quick answers about scanning invoices, VAT, reports and your account." sections={[
    { title: "What can I upload?", body: "PDF invoices and photos of invoices or till receipts (JPG, PNG or WEBP). Multi-page invoices of up to 20 pages are supported. Clear, well-lit photos give the best results." },
    { title: "How do I get my data out?", body: "Download confirmed invoices to Excel by month, quarter, year or custom dates, or download any single invoice as a PDF. Each Excel row links back to its invoice." },
    { title: "Does it check supplier VAT numbers?", body: "Every UK VAT number is checked for errors automatically, and one click opens HMRC's official VAT number checker to confirm it is registered." },
    { title: "Is there a free trial?", body: "Yes. Your first company gets a free 14-day trial with all VAT and ordering features. No card is needed. See the pricing page for plans." },
    { title: "Is my data secure?", body: "Each company's data is kept separate, and only people you invite can see it. All connections are encrypted, and every change to an invoice is recorded." },
    { title: "How do you handle personal data?", body: "Please read our privacy notice for what we collect, why, and how long we keep it." },
    { title: "Can I organise records by month, quarter or year?", body: "Yes. Dashboards, Excel downloads and bank matching all work by month, quarter, year or your own dates." },
    { title: "Can I manage more than one company?", body: "Yes. One account can hold several companies, each with its own invoices, suppliers and team members." },
    { title: "Will the details always be read correctly?", body: "Most invoices are read accurately, but no system is perfect. You check every value before an invoice is saved, and the app warns you when totals do not add up." }
  ]} />;
}

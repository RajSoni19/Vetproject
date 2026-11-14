import { SimplePublicPage } from "@/components/public-pages";

export default function PublicSupportPage() {
  return <SimplePublicPage eyebrow="Support" title="Help for UK invoice, VAT and reporting workflows." description="Find the fastest route for common tasks, from first upload to report export." sections={[
    { title: "Start with an invoice", body: "Upload a supplier invoice, check the extracted fields and keep the original document linked to the record." },
    { title: "Review VAT details", body: "Check net, VAT and gross totals, review supplier VAT information where supported, and correct any extraction errors." },
    { title: "Organise by period", body: "Group reviewed records by month, quarter or year for bookkeeping and VAT review preparation." },
    { title: "Export records", body: "Prepare Excel or PDF outputs where supported, including useful totals and document references." },
    { title: "Account questions", body: "Use the contact page for pricing, plan limits, supported file formats and onboarding questions." },
    { title: "Important reminder", body: "Vet the VAT helps organise information. Businesses remain responsible for checking records and taking tax advice where needed." }
  ]} />;
}

import { SimplePublicPage } from "@/components/public-pages";

export default function TermsPage() {
  return <SimplePublicPage eyebrow="Terms" title="Terms and Conditions outline." description="Final commercial and legal terms should be reviewed before production launch." sections={[
    { title: "Accounts and acceptable use", body: "Cover account registration, eligibility, permitted use and prohibited activity." },
    { title: "Plans and payments", body: "Define subscription plans, payments, renewals, invoice limits, taxes and cancellation terms." },
    { title: "User responsibilities", body: "Users should review extracted data, validate records and take responsibility for accounting and VAT accuracy." },
    { title: "VAT validation limits", body: "VAT checks and tax-related outputs should not be presented as guarantees or tax advice." },
    { title: "Service terms", body: "Cover availability, suspension, termination, data export and changes to the service or terms." },
    { title: "Legal framework", body: "Confirm intellectual property, liability limits, governing law and dispute resolution." }
  ]} cta={false} />;
}

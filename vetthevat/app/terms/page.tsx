import { SimplePublicPage } from "@/components/public-pages";

export default function TermsPage() {
  return <SimplePublicPage eyebrow="Terms" title="Terms of use" description="A plain-English summary of how VET THE VAT may be used. Please contact us for the full terms." sections={[
    { title: "Your account", body: "You are responsible for keeping your sign-in details safe and for the people you invite to your company." },
    { title: "Using the service", body: "Use VET THE VAT only for lawful business purposes and only for companies you are authorised to act for." },
    { title: "Plans and payments", body: "Plans, prices, limits and renewal dates are shown on the pricing page and on your invoices." },
    { title: "Checking your records", body: "You are responsible for checking that the details read from your documents are correct before you rely on them." },
    { title: "Not tax advice", body: "VET THE VAT organises your records and VAT figures. It does not give tax or legal advice." },
    { title: "Your data", body: "Your records belong to you. You can download them to Excel or PDF at any time." }
  ]} cta={false} />;
}

import { SimplePublicPage } from "@/components/public-pages";
import { COMPANY } from "@/lib/site-links";

export const metadata = { title: "Disclaimer", description: `Disclaimer for VET THE VAT, provided by ${COMPANY.name}.` };

export default function DisclaimerPage() {
  return <SimplePublicPage eyebrow="Disclaimer" title="Disclaimer" description={`VET THE VAT is provided by ${COMPANY.name}, registered in England and Wales, company number ${COMPANY.number}. Registered office: ${COMPANY.registeredOffice}.`} sections={[
    { title: "Not tax or financial advice", body: "VET THE VAT helps you organise invoices, receipts and VAT figures. It does not give tax, legal, accounting or financial advice. Please speak to a qualified accountant or tax adviser before making decisions or submitting a VAT return." },
    { title: "Check your records", body: "Details are read from your documents automatically and may contain mistakes. You are responsible for checking every invoice, VAT amount and total before you rely on it or share it." },
    { title: "VAT claims", body: "Whether VAT can be reclaimed depends on your circumstances and HMRC rules. The figures shown are for your records and do not confirm that any amount can be claimed." },
    { title: "VAT number checks", body: "VAT numbers are checked for format errors only. Use the link to HMRC's official checker to confirm a business is VAT registered." },
    { title: "Supplier prices", body: "Price comparisons and savings are based only on invoices you have saved. They are estimates and do not guarantee future prices or availability." },
    { title: "Availability", body: "We work to keep VET THE VAT available and accurate, but we cannot guarantee it will always be uninterrupted or error-free. Please keep your own copies of important records." },
    { title: "Company details", body: `${COMPANY.name}, company number ${COMPANY.number}, ${COMPANY.registeredOffice}. You can view our record on Companies House.` }
  ]} cta={false} />;
}

import { SimplePublicPage } from "@/components/public-pages";

export default function FaqPage() {
  return <SimplePublicPage eyebrow="FAQ" title="Common questions about Vet the VAT." description="Clear customer-facing answers for invoice capture, VAT validation, reporting and data review." sections={[
    { title: "What files can Vet the VAT read?", body: "Vet the VAT is intended to accept supported invoice and receipt formats. Exact formats, maximum file sizes and image quality requirements should be confirmed before launch. Uploaded documents should be legible." },
    { title: "How can I download the extracted data?", body: "Processed invoice records can be prepared for supported Excel or PDF exports where the feature is enabled." },
    { title: "Does Vet the VAT validate VAT registration?", body: "The product direction includes supplier VAT registration checks through supported verification services. Availability and returned information may differ by jurisdiction." },
    { title: "Is Vet the VAT free to try?", body: "See the plan information page for the published allowance and feature comparison. This website does not activate trials or take payments." },
    { title: "Is my data secure?", body: "The platform should protect invoice and business information through secure authentication, access permissions, file storage and data transfer controls. Specific controls should only be claimed once implemented." },
    { title: "Is Vet the VAT GDPR compliant?", body: "GDPR positioning should be confirmed against the implemented service, data processing roles, retention settings and provider arrangements before publication." },
    { title: "Can I organise records by month, quarter or year?", body: "Yes, the planned reporting workflow includes monthly, quarterly and annual reporting periods." },
    { title: "Can I use Vet the VAT for UK and EU suppliers?", body: "The product is intended for UK and EU business workflows, with VAT verification depending on supported services and returned information." },
    { title: "Can I process multiple companies?", body: "Published company allowances are listed on the pricing page. This temporary website does not provide account access or enforce entitlements." },
    { title: "Will extracted data always be accurate?", body: "No extraction system is perfect. Users should review extracted values, resolve exceptions and confirm records before relying on them." }
  ]} />;
}

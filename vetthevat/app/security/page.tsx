import {SimplePublicPage} from "@/components/public-pages";
export default function SecurityPage(){return <SimplePublicPage eyebrow="Security" title="How we protect your data" description="Your invoices and business information are kept private to your company." sections={[
 {title:"Private to your company",body:"Each company's records are kept separate. Only people you invite can see them, and you choose what each person can do."},
 {title:"Secure sign-in",body:"Accounts are protected by password, and you can see and sign out of every device that is signed in."},
 {title:"Encrypted connections",body:"All traffic between your device and VET THE VAT is encrypted."},
 {title:"Full change history",body:"Every change to an invoice is recorded, so you can always see who changed what and when."} ]} cta={false}/>;}

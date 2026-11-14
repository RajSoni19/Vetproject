import {SimplePublicPage} from "@/components/public-pages";
export default function SecurityPage(){return <SimplePublicPage eyebrow="Website security" title="Information without financial uploads." description="This temporary website is for product information. It does not provide access to private financial workspaces." sections={[
 {title:"No web account access",body:"Registration, sign-in and private workspace routes are unavailable on this website."},
 {title:"No document or payment collection",body:"This website does not accept invoice uploads, card details, Direct Debit mandates or subscription purchases."},
 {title:"Existing applications",body:"Mobile application accounts and services remain separate. Use the support information in your app or its official store listing."},
 {title:"No certification claim",body:"This page does not claim a security certification, an independent audit or regulatory compliance for the product."}
 ]} cta={false}/>;}

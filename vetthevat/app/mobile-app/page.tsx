import {Download} from "lucide-react";
import {SimplePublicPage} from "@/components/public-pages";
import {ButtonLink} from "@/components/ui/button";
import {playStoreUrl} from "@/lib/site-links";
export default function MobileAppPage(){return <><SimplePublicPage eyebrow="Mobile app" title="VET THE VAT on mobile." description="Use the existing mobile applications for your invoice and VAT workflows. This temporary website provides product information; web account access is not available here." sections={[
 {title:"Android",body:"Open the official VET THE VAT listing on Google Play using the link below."},
 {title:"iOS",body:"The iOS store link is being verified before publication. Continue using your existing application as usual."},
 {title:"Existing app services",body:"This website does not connect to, migrate or replace your mobile application accounts and records."}
 ]} cta={false}/><div className="container-page -mt-10 mb-16"><ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4"/>Download Android app</ButtonLink></div></>;}

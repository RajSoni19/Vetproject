import {Download} from "lucide-react";
import {SimplePublicPage} from "@/components/public-pages";
import {ButtonLink} from "@/components/ui/button";
import {playStoreUrl} from "@/lib/site-links";
export default function MobileAppPage(){return <><SimplePublicPage eyebrow="Mobile app" title="VET THE VAT on your phone" description="Scan invoices and receipts with your camera, check VAT and keep your records with you wherever you are." sections={[
 {title:"Android",body:"Download VET THE VAT from Google Play using the button below."},
 {title:"iPhone",body:"The iPhone app is coming soon. In the meantime, open the website in Safari and choose Share, then Add to Home Screen."},
 {title:"Using the website on your phone",body:"The full VET THE VAT workspace also works in your phone's browser. Sign in at the website to scan invoices with your camera."}
 ]} cta={false}/><div className="container-page -mt-10 mb-16"><ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4"/>Download for Android</ButtonLink></div></>;}

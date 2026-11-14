import {PublicShell} from "@/components/public-shell";
import {ServiceStatusView, type ServiceStatusItem} from "@/components/service-status-view";
import {localUat} from "@/lib/server/local-uat";
import {localWorkerHealth} from "@/lib/server/saas/local-worker-health";
import {webAuthServices} from "@/lib/server/web-auth/runtime";
export const dynamic='force-dynamic';
const liveServices: ServiceStatusItem[]=[
 ["Web accounts","Isolated development only","Registration, verification, password login, sessions and password changes use the local development identity service. Production identity and email delivery are not configured."],
 ["Invoices and VAT","Isolated development workflows","Authorized development companies can create suppliers or customers, prepare and confirm manual invoices, view confirmed VAT summaries, and download authorized PDF or XLSX exports from the isolated PostgreSQL database. Private originals, uploads, OCR, scanning, payment allocation and production use remain unavailable. Do not use this web application for live financial records."],
 ["ORS","Unavailable","Procurement, inventory, sales orders, fulfilment and their VAT links are not operational web services."],
 ["Billing & subscriptions","Unavailable","No payment acceptance, subscription activation or billing portal is available."],
 ["Online enquiries","Unavailable","Contact and Get Started submissions are disabled until durable storage and spam protection are configured. The Contact page provides the published support email link."],
 ["Mobile applications","Separate service","Published mobile applications and their existing customer services are not connected to this web development environment."]
];
const localServices: ServiceStatusItem[]=[
 ["Web accounts","Available for local development","Registration, email verification, password sign-in, sessions and password changes use the isolated PostgreSQL development database. Real verification email is not configured, so accounts cannot complete email verification until an SMTP sender is set up."],
 ["Invoices and VAT","Manual workflows available for local development","Authorized development companies can create suppliers and customers, save and confirm manual invoices, view VAT summaries, and download PDF or XLSX exports. Original-document scanning and OCR are not configured. Use synthetic development data only."],
 ["ORS","Available for local development","Procurement, stock, sales orders and fulfillment workflows are enabled against isolated development data. They are not connected to live business operations."],
 ["Billing and payments","Not configured","The local billing schema is present, but Stripe test credentials and the required provider approvals are not configured. No checkout, payment or subscription activation is available."],
 ["Online enquiries","Email handoff only","The Get Started form can prepare an email for the visitor to review and send. Durable online enquiry storage is disabled until verified bot protection and runtime settings are configured."],
 ["Mobile applications","Separate service","Published mobile applications and their existing customer services are not connected to this web development environment."]
];
export default async function ServiceStatus(){const local=process.env.NEXT_PUBLIC_VTV_LOCAL_WORKSPACE==="1",uat=localUat(process.env),worker=localWorkerHealth();let database=false;if(uat){try{const s=webAuthServices();database=Boolean(s&&await s.store.transaction(async sql=>(await sql.query('SELECT 1 AS ready')).rows[0]?.ready===1));}catch{}}
 const services: ServiceStatusItem[]=uat?[
 ["Accounts and company security",database?"UAT database connected":"Unavailable","Real password authentication, secure sessions, tenant permissions and company records. Synthetic accounts only."],
 ["Invoices, VAT and exports",database?"Available in isolated UAT":"Unavailable","Private uploads, human-reviewed invoices, exact VAT calculations, original viewing and PDF/XLSX exports use the isolated PostgreSQL database."],
 ["Malware inspection and OCR",worker.ready?"Local worker ready":"Local worker unavailable",worker.message],
 ["ORS",database?"Available in isolated UAT":"Unavailable","Catalogue, supplier comparison, cart and supplier-specific WhatsApp drafts persist in PostgreSQL. Draft generation does not confirm supplier dispatch."],
 ["Super Admin",database?"MFA-protected UAT administration":"Unavailable","Platform roles, customer profiles, plans, billing records, CRM, support and real analytics. No default administrator credentials."],
 ["Contact and enquiries",database?"Persisted UAT enquiries":"Unavailable","The local signed security check and PostgreSQL contact store connect website enquiries to Leads CRM."],
 ["Billing and outbound services","No real payment collection","Manual billing records and scheduled UAT reminders are available. SMTP is captured locally for synthetic recipients. Production payment and email providers are not enabled."]
 ]:local?localServices:liveServices;
 const desc = uat ? "This is an isolated synthetic UAT environment. Database connectivity and the local document-worker heartbeat are checked here; no production readiness is implied." : local ? "This local development workspace reports enabled development features and provider setup. Development data is isolated and must not be used for live financial records." : "The website describes the intended product. The web application has not been released for live business use. These are implementation availability statements, not live provider health measurements.";
 return <PublicShell><ServiceStatusView services={services} descriptionText={desc} /></PublicShell>;
}

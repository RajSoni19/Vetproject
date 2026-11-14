import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/public-shell";
import { ButtonLink } from "@/components/ui/button";
import { verifyReceipt } from "@/lib/server/leads/core";
export const dynamic = "force-dynamic";
export const metadata = { title: "Enquiry received | VET THE VAT", robots: { index: false, follow: false } };
export default async function ThankYouPage() {
  const reference = verifyReceipt((await cookies()).get("__Host-vtv-lead-receipt")?.value ?? "", process.env.LEADS_RECEIPT_SECRET);
  if (!reference) redirect("/get-started");
  return <PublicShell><main className="container-page py-16 sm:py-24"><section className="mx-auto max-w-2xl rounded-2xl border border-line p-6 text-center shadow-sm sm:p-10"><div aria-hidden="true" className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-50 text-3xl text-[#0F7A3A]">✓</div><h1 className="mt-6 text-3xl font-bold">Your enquiry has been received</h1><p className="mt-5 text-lg leading-8 text-muted">Thank you for your interest in VET THE VAT. Your enquiry has been received, and our team will contact you shortly.</p><p className="mt-5 break-all text-sm text-muted">Your reference: {reference}</p><ButtonLink className="mt-8" href="/">Back to home</ButtonLink></section></main></PublicShell>;
}

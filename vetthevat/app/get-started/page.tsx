import { PublicShell } from "@/components/public-shell";
import {ContactForm} from "@/components/contact-form";
import {contactFormConfiguration} from "@/lib/server/contact-runtime";
export const dynamic = "force-dynamic";
export const metadata = { title: "Get Started | VET THE VAT", description: "Tell us about your VAT Management and ordering requirements." };
export default function GetStartedPage() {
  const form = contactFormConfiguration();
  return <PublicShell><main className="container-page py-12 sm:py-20"><div className="mx-auto max-w-2xl"><p className="text-sm font-semibold text-[#0F7A3A]">Let’s talk about your business</p><h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Get Started</h1><p className="mt-5 text-lg leading-8 text-muted">Interested in VAT Management, ORS or both? Tell us what you need and our team will help you take the next step.</p><div className="mt-8 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-8"><ContactForm {...form}/></div></div></main></PublicShell>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { publicSupportEmail } from "@/lib/site-links";
import { leadServices, validateLead, LeadValidationError, type LeadFields } from "@/lib/leads/contracts";

type Turnstile = { render(element: HTMLElement, options: { sitekey: string; action: string; size: string; callback(token: string): void; "expired-callback"(): void; "error-callback"(): void }): string; reset(id: string): void; remove(id: string): void };
function widget() { return (window as typeof window & { turnstile?: Turnstile }).turnstile; }
export function LeadForm({ enabled, siteKey }: { enabled: boolean; siteKey?: string }) {
  const [busy, setBusy] = useState(false), [token, setToken] = useState(""), [message, setMessage] = useState(""), [errors, setErrors] = useState<LeadFields>({});
  const idempotency = useRef(""), widgetId = useRef<string | null>(null), host = useRef<HTMLDivElement>(null), summary = useRef<HTMLDivElement>(null), submitting = useRef(false);
  const mount = () => { if (siteKey && host.current && widget() && widgetId.current === null) widgetId.current = widget()!.render(host.current, { sitekey: siteKey, action: "lead-enquiry", size: "flexible", callback: setToken, "expired-callback": () => setToken(""), "error-callback": () => { setToken(""); setMessage("The security check is unavailable. Reload the page and try again."); } }); };
  useEffect(() => { idempotency.current = crypto.randomUUID(); mount(); return () => { if (widgetId.current !== null) { widget()?.remove(widgetId.current); widgetId.current = null; } }; }, [siteKey]);
  useEffect(() => { if (message || Object.keys(errors).length) summary.current?.focus(); }, [message, errors]);
  const fieldClass = "mt-2 w-full rounded-lg border border-line bg-white px-3 py-3 text-ink outline-none focus:border-[#0F7A3A] focus:ring-2 focus:ring-[#0F7A3A]/25";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    setErrors({}); setMessage("");
    const form = new FormData(event.currentTarget);
    const input = { fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone"), businessName: form.get("businessName"), service: form.get("service"), requirements: form.get("requirements"), consent: form.get("consent") === "on" };
    let lead;
    try { lead = validateLead(input); } catch (error) { if (error instanceof LeadValidationError) setErrors(error.fields); return; }
    if (!enabled) {
      const subject = `VET THE VAT enquiry: ${lead.service}`;
      const body = [
        `Name: ${lead.fullName}`,
        `Business email: ${lead.email}`,
        `Phone: ${lead.phone}`,
        `Business: ${lead.businessName}`,
        `Service: ${lead.service}`,
        "",
        "Requirements:",
        lead.requirements || "None provided",
        "",
        "I consent to VET THE VAT contacting me by email or phone about this enquiry.",
      ].join("\n");
      setMessage("Your email app should open with the enquiry prepared. The enquiry is not sent or saved online; review it and send it from your email app.");
      window.location.href = `mailto:${publicSupportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    if (!token) { setMessage("Please complete the security check before submitting."); return; }
    submitting.current = true; setBusy(true);
    try {
      const response = await fetch("/api/public/leads", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotency.current }, credentials: "same-origin", body: JSON.stringify({ ...lead, website: form.get("website") ?? "", turnstileToken: token }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) { setErrors(result.error?.fields ?? {}); throw new Error(result.error?.message ?? "Your enquiry could not be confirmed. Please try again."); }
      if (result.received !== true || !/^[a-f0-9-]{36}$/.test(result.reference) || result.redirect !== "/get-started/thank-you") throw new Error("Your enquiry could not be confirmed. Please retry with this form.");
      // Keep the same key for retries; the server's signed HttpOnly receipt gates
      // the confirmation page. No contact data enters URLs or browser storage.
      window.location.assign("/get-started/thank-you");
    } catch (error) {
      setMessage(error instanceof Error && error.name !== "TimeoutError" && error.name !== "TypeError" ? error.message : "We could not confirm your enquiry. Please retry with this form; duplicate submissions are protected.");
      setToken(""); if (widgetId.current !== null) widget()?.reset(widgetId.current);
      submitting.current = false; setBusy(false);
    }
  }
  return <form onSubmit={submit} className="space-y-6" aria-describedby="lead-privacy lead-availability">
    <div id="lead-availability" role="status" className="rounded-lg border border-line bg-wash p-4 text-sm text-muted">{enabled ? "Tell us what your business needs. We will use these details to respond to your enquiry." : "Secure online submission is temporarily unavailable. You can prepare an email enquiry instead; it will only be sent if you review and send it in your email app. Please do not include passwords, bank details or invoice documents."}</div>
    {(message || Object.keys(errors).length > 0) && <div ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">{message || "Please check the highlighted fields."}</p>{Object.entries(errors).map(([key, value]) => <p key={key} className="mt-2"><a href={`#lead-${key}`} className="underline">{value}</a></p>)}</div>}
    <div className="grid gap-5 sm:grid-cols-2">{([{ name: "fullName", label: "Full name", max: 120, type: "text", autocomplete: "name" }, { name: "email", label: "Business email", max: 254, type: "email", autocomplete: "email" }, { name: "phone", label: "Phone number", max: 40, type: "tel", autocomplete: "tel" }, { name: "businessName", label: "Business name", max: 200, type: "text", autocomplete: "organization" }] as const).map(field => <div key={field.name}><label htmlFor={`lead-${field.name}`} className="text-sm font-semibold">{field.label} <span className="font-normal text-muted">(required)</span></label><input id={`lead-${field.name}`} name={field.name} type={field.type} maxLength={field.max} autoComplete={field.autocomplete} required disabled={busy} aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `lead-error-${field.name}` : undefined} className={fieldClass} />{errors[field.name] && <p id={`lead-error-${field.name}`} className="mt-2 text-sm text-red-800">{errors[field.name]}</p>}</div>)}</div>
    <div><label htmlFor="lead-service" className="text-sm font-semibold">Interested service <span className="font-normal text-muted">(required)</span></label><select id="lead-service" name="service" required disabled={busy} className={fieldClass} aria-invalid={Boolean(errors.service)} aria-describedby={errors.service ? "lead-error-service" : undefined}><option value="">Select a service</option>{leadServices.map(service => <option key={service}>{service}</option>)}</select>{errors.service && <p id="lead-error-service" className="mt-2 text-sm text-red-800">{errors.service}</p>}</div>
    <div><label htmlFor="lead-requirements" className="text-sm font-semibold">Additional requirements <span className="font-normal text-muted">(optional)</span></label><textarea id="lead-requirements" name="requirements" maxLength={3000} rows={5} disabled={busy} className={fieldClass} aria-invalid={Boolean(errors.requirements)} aria-describedby="lead-requirements-help lead-error-requirements" /><p id="lead-requirements-help" className="mt-2 text-xs text-muted">Up to 3,000 characters. Please do not include passwords, bank details or invoice documents.</p><p id="lead-error-requirements" className="text-sm text-red-800">{errors.requirements}</p></div>
    <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden"><label htmlFor="lead-website">Leave this field blank</label><input id="lead-website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
    <div id="lead-privacy" className="rounded-lg border border-line p-4 text-sm leading-6 text-muted">We will use your contact details and enquiry to respond about the services you select. This is not a newsletter subscription. See our <Link href="/privacy#lead-enquiries" className="font-semibold text-[#0F7A3A] underline">privacy notice</Link>.</div>
    <div><label htmlFor="lead-consent" className="flex items-start gap-3 text-sm leading-6"><input id="lead-consent" name="consent" type="checkbox" required disabled={busy} className="mt-1 h-5 w-5 shrink-0 accent-[#0F7A3A]" aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "lead-error-consent" : undefined} /><span>I consent to VET THE VAT contacting me by email or phone about my enquiry. <span className="text-muted">(required)</span></span></label>{errors.consent && <p id="lead-error-consent" className="mt-2 text-sm text-red-800">{errors.consent}</p>}</div>
    {enabled && siteKey && <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={mount} onError={() => setMessage("The security check could not load. Please reload and try again.")} /><div ref={host} className="min-h-16 max-w-full" aria-label="Security verification" /></>}
    <button type="submit" disabled={busy} aria-describedby="lead-availability" className="min-h-12 w-full rounded-lg bg-[#0F7A3A] px-6 py-3 font-semibold text-white hover:bg-[#09602c] focus:outline-none focus:ring-2 focus:ring-[#0F7A3A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Submitting your enquiry…" : enabled ? "Submit enquiry" : "Prepare email enquiry"}</button>
  </form>;
}

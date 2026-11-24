"use client";
// "Check with HMRC" link for supplier forms. Copies the VAT number typed in the
// same form, then opens HMRC's official checker in a new tab to paste it into.
import { useState } from "react";
import { ExternalLink } from "lucide-react";

export const HMRC_VAT_CHECK_URL = "https://www.tax.service.gov.uk/check-vat-number/enter-vat-details";

export function HmrcVatCheckLink({ inputName = "vatNumber" }: { inputName?: string }) {
  const [copied, setCopied] = useState("");
  return <span className="flex flex-wrap items-center gap-2 text-xs font-normal">
    <a href={HMRC_VAT_CHECK_URL} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-2"
      onClick={(event) => {
        const input = event.currentTarget.closest("form")?.elements.namedItem(inputName) as HTMLInputElement | null;
        const digits = (input?.value ?? "").replace(/^GB/i, "").replace(/\D/g, "");
        if (digits) void navigator.clipboard?.writeText(digits).then(() => setCopied(digits), () => undefined);
      }}>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Check with HMRC
    </a>
    {copied ? <span role="status" className="text-muted">{copied} copied. Paste it into HMRC&apos;s page.</span> : null}
  </span>;
}

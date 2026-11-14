"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { locales, type Locale } from "@/lib/i18n/catalog";
import { useLocale } from "@/components/locale-provider";

const displayNames: Record<Locale, string> = {
  "en-GB": "English", "gu-IN": "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0", "hi-IN": "\u0939\u093F\u0928\u094D\u0926\u0940", "es-ES": "Espa\u00F1ol",
  "fr-FR": "Fran\u00E7ais", ar: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", "pt-PT": "Portugu\u00EAs", "de-DE": "Deutsch",
  "it-IT": "Italiano", "pl-PL": "Polski", "ur-PK": "\u0627\u0631\u062F\u0648", "pa-IN": "\u0A2A\u0A70\u0A1C\u0A3E\u0A2C\u0A40"
};

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault(); setOpen(false); trigger.current?.focus(); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.target === trigger.current && !open && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault(); setOpen(true);
      requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>("[aria-checked='true']")?.focus()); return;
    }
    const options = menu.current ? [...menu.current.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']")] : [];
    if (!options.includes(event.target as HTMLButtonElement)) return;
    event.preventDefault();
    const index = options.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
    options[next]?.focus();
  }

  return <div className={`relative ${compact ? "w-full" : "shrink-0"}`} onKeyDown={onKeyDown}>
    <button ref={trigger} type="button" aria-label={t("chooseLanguage")} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className={`inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink hover:border-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${compact ? "" : "sm:w-auto"}`}>
      <span className="inline-flex min-w-0 items-center gap-2"><Globe2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" /><span className="whitespace-nowrap">{displayNames[locale]}</span></span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <div ref={menu} role="menu" aria-label={t("chooseLanguage")} className={`absolute top-full z-50 mt-2 max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-xl ${compact ? "left-0 right-0" : "right-0 w-64"}`}>
      {locales.map((item) => <button key={item.code} type="button" role="menuitemradio" data-locale={item.code} aria-checked={locale === item.code}
        tabIndex={locale === item.code ? 0 : -1}
        onClick={() => { setLocale(item.code); setOpen(false); trigger.current?.focus(); }}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{displayNames[item.code]}</span><span className="block text-xs text-muted">{item.support === "complete" ? t("complete") : t("partial")}</span></span>
        {locale === item.code && <Check className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}

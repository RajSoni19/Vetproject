"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X, Download } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { COMPANY, playStoreUrl } from "@/lib/site-links";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";

const nav = [
  { href: "/", label: "Home" },
  { href: "/product", label: "Product" },
  { href: "/benefits", label: "Benefits" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQs" }
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { t } = useLocale();
  const localizedNav = nav.map((item, index) => ({ ...item, label: [t("home"),t("product"),t("benefits"),t("howItWorks"),t("pricing"),t("faqs")][index] }));

  return (
    <div className="min-h-screen bg-white">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="border-b border-line bg-ink text-white">
        <div className="container-page flex flex-col gap-2 py-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between">
          <span className="hidden sm:inline">UK-focused invoice capture, VAT review and export workflows</span>
          <div className="flex flex-wrap gap-4 text-white/80">
            <Link href="/contact" className="hover:text-white">Contact</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
            <Link href="/mobile-app" className="hover:text-white">Mobile app</Link>
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur" onKeyDown={(event) => {
        if (event.key === "Escape" && open) { setOpen(false); menuButton.current?.focus(); }
      }}>
        <div className="container-page flex h-[72px] min-w-0 items-center gap-2 sm:gap-4">
          <div className="shrink-0"><Logo /></div>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-5 text-[13px] font-medium text-muted xl:flex" aria-label="Main navigation">
            {localizedNav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto hidden shrink-0 items-center gap-2 xl:flex">
            <LanguageSwitcher />
            <Link href="/login" className="whitespace-nowrap px-1.5 text-sm font-semibold text-brand-700">{t("signIn")}</Link>
            <ButtonLink href={playStoreUrl} variant="outline" target="_blank" rel="noopener noreferrer" className="min-h-10 whitespace-nowrap px-3">
              <Download className="h-4 w-4" />
              {t("downloadApp")}
            </ButtonLink>
            <ButtonLink href="/get-started" variant="secondary" className="min-h-10 whitespace-nowrap px-3">{t("getStarted")}</ButtonLink>
          </div>
          <Link href="/login" className="ml-auto whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold text-brand-700 hover:bg-wash sm:px-3 xl:hidden">{t("signIn")}</Link>
          <button ref={menuButton} type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink hover:bg-wash xl:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="public-mobile-navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open ? (
          <div id="public-mobile-navigation" className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-line bg-white xl:hidden">
            <div className="container-page grid gap-1 py-4">
              <LanguageSwitcher compact />
              {localizedNav.map((item) => (
                <Link key={item.href} href={item.href} className="min-h-11 rounded-lg px-3 py-3 font-medium hover:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500" onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
              <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer" variant="outline" className="mt-2 min-h-11 whitespace-nowrap">
                {t("downloadApp")}
              </ButtonLink>
              <ButtonLink href="/get-started" onClick={() => setOpen(false)} className="min-h-11 whitespace-nowrap">{t("getStarted")}</ButtonLink>
            </div>
          </div>
        ) : null}
      </header>
      <div id="main-content" tabIndex={-1}>{children}</div>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-[#f8fbfa] py-12">
      <div className="container-page grid gap-10 md:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-md text-sm leading-6 text-muted">
            A UK-focused invoice capture, VAT review and reporting platform for businesses, accountants, bookkeepers and finance teams.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href={playStoreUrl} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" />Get it on Google Play</ButtonLink>
            <ButtonLink href="/get-started" variant="outline">Get started</ButtonLink>
          </div>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          <FooterList title="Product" items={["Home", "Product", "Benefits", "Features", "How it works", "Mobile app"]} hrefs={["/", "/product", "/benefits", "/features", "/how-it-works", "/mobile-app"]} />
          <FooterList title="Learn more" items={["Pricing", "FAQs", "Privacy", "Terms", "Disclaimer", "Sign in"]} hrefs={["/pricing", "/faq", "/privacy", "/terms", "/disclaimer", "/login"]} />
          <FooterList title="Help" items={["About", "Support", "Contact", "Security"]} hrefs={["/about", "/support", "/contact", "/security"]} />
        </div>
      </div>
      {/* Legal company details (Companies Act 2006 requires the name, number and registered office). */}
      <div className="container-page mt-10 border-t border-line pt-6 text-xs leading-6 text-muted">
        <p>
          © {new Date().getFullYear()} {COMPANY.name}. Registered in England and Wales, company number{" "}
          <a href={COMPANY.companiesHouseUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline underline-offset-2">{COMPANY.number}</a>.
          {" "}Registered office: {COMPANY.registeredOffice}.
        </p>
        <p>VET THE VAT keeps your records organised and does not give tax, legal or financial advice. <Link href="/disclaimer" className="underline underline-offset-2 hover:text-ink">Read the disclaimer</Link>.</p>
      </div>
    </footer>
  );
}

function FooterList({ title, items, hrefs }: { title: string; items: string[]; hrefs: string[] }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink">{title}</h2>
      <div className="mt-4 grid gap-3 text-sm text-muted">
        {items.map((item, index) => (
          <Link key={item} href={hrefs[index]} className="hover:text-ink">
            {item}
          </Link>
        ))}
      </div>
    </div>
  );
}

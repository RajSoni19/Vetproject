"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { usePathname } from "next/navigation";

export function GlobalLanguageSwitcher() {
  const pathname = usePathname();
  const publicPages = new Set(["/", "/about", "/product", "/benefits", "/features", "/how-it-works", "/mobile-app", "/pricing", "/faq", "/contact", "/support", "/security", "/privacy", "/terms", "/get-started", "/get-started/thank-you"]);
  if (publicPages.has(pathname)) return null;
  return <div className="fixed bottom-4 right-4 z-[60] shadow-lg" data-global-language-switcher>
    <LanguageSwitcher />
  </div>;
}

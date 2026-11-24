"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { usePathname } from "next/navigation";

export function GlobalLanguageSwitcher() {
  const pathname = usePathname();
  const publicPages = new Set(["/", "/about", "/product", "/benefits", "/features", "/how-it-works", "/mobile-app", "/pricing", "/faq", "/contact", "/support", "/security", "/privacy", "/terms", "/disclaimer", "/get-started", "/get-started/thank-you"]);
  if (publicPages.has(pathname)) return null;
  // Above the phone's bottom menu bar (64px + safe area); bottom corner on larger screens.
  return <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-[60] rounded-lg shadow-lg lg:bottom-4 lg:right-4" data-global-language-switcher>
    <LanguageSwitcher openUp />
  </div>;
}

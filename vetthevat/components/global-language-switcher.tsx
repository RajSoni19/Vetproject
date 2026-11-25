"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { usePathname } from "next/navigation";

export function GlobalLanguageSwitcher() {
  const pathname = usePathname();
  const publicPages = new Set(["/", "/about", "/product", "/benefits", "/features", "/how-it-works", "/mobile-app", "/pricing", "/faq", "/contact", "/support", "/security", "/privacy", "/terms", "/disclaimer", "/get-started", "/get-started/thank-you"]);
  if (publicPages.has(pathname)) return null;
  // Signed-in workspace: the language menu sits in the top bar next to Sign out (authenticated-session).
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  // Other pages (sign in, password reset…): top-right corner, never covering page content at the bottom.
  return <div className="fixed right-3 top-3 z-[60] rounded-lg shadow-lg" data-global-language-switcher>
    <LanguageSwitcher />
  </div>;
}

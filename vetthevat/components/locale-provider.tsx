"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isLocale, localeDirection, message, type Locale, type MessageKey } from "@/lib/i18n/catalog";
import { applyDomTranslations } from "@/lib/i18n/dom-translator";

const storageKey = "vtv.preferred-locale.v1";
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; syncAccountLocale: () => Promise<boolean>; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? document.cookie.split("; ").find((part) => part.startsWith("vtv_locale="))?.split("=")[1];
    const candidate = stored ? decodeURIComponent(stored) : "";
    return isLocale(candidate) ? candidate : "en-GB";
  } catch { return "en-GB"; }
}

function localeToGoogleLang(loc: Locale): string {
  if (loc === "gu-IN") return "gu";
  if (loc === "hi-IN") return "hi";
  if (loc === "es-ES") return "es";
  if (loc === "fr-FR") return "fr";
  if (loc === "de-DE") return "de";
  if (loc === "it-IT") return "it";
  if (loc === "pt-PT") return "pt";
  if (loc === "pl-PL") return "pl";
  if (loc === "ar") return "ar";
  if (loc === "ur-PK") return "ur";
  if (loc === "pa-IN") return "pa";
  return "en";
}

function triggerGoogleTranslate(loc: Locale) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const lang = localeToGoogleLang(loc);
  const host = window.location.hostname;

  if (lang === "en") {
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    if (host) {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=${host}; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${host}; path=/;`;
    }
  } else {
    document.cookie = `googtrans=/en/${lang}; path=/;`;
    if (host) {
      document.cookie = `googtrans=/en/${lang}; domain=${host}; path=/;`;
      document.cookie = `googtrans=/en/${lang}; domain=.${host}; path=/;`;
    }
  }

  const applySelect = () => {
    const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (select) {
      if (select.value !== lang) {
        select.value = lang;
        select.dispatchEvent(new Event("change"));
      }
      return true;
    }
    return false;
  };

  if (!applySelect()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (applySelect() || attempts > 20) {
        clearInterval(interval);
      }
    }, 150);
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en-GB");
  const accountPreferenceEnabled = useRef(false);
  const writeSequence = useRef(0);
  const chosenLocale = useRef<Locale>("en-GB");
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pathname = usePathname();

  useEffect(() => {
    updateLocale(readStoredLocale());
  }, []);

  useEffect(() => {
    chosenLocale.current = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    triggerGoogleTranslate(locale);
    const timer = setTimeout(() => {
      applyDomTranslations(locale);
    }, 50);
    return () => clearTimeout(timer);
  }, [locale, pathname]);

  const persistLocal = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(storageKey, next);
      document.cookie = `vtv_locale=${encodeURIComponent(next)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch {
      /* Private browsing can disable persistence; the current selection still works. */
    }
  }, []);

  const queueAccountPreference = useCallback((next: Locale, sequence: number) => {
    if (!accountPreferenceEnabled.current) return;
    writeQueue.current = writeQueue.current.catch(() => {}).then(async () => {
      if (sequence !== writeSequence.current) return;
      try {
        const session = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000) });
        if (!session.ok) return;
        const body = await session.json();
        if (typeof body.csrfToken !== "string" || sequence !== writeSequence.current) return;
        await fetch("/api/account/profile", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "x-csrf-token": body.csrfToken },
          body: JSON.stringify({ preferredLocale: next }),
          signal: AbortSignal.timeout(10000)
        });
      } catch {
        /* The device-local preference remains saved if account sync is unavailable. */
      }
    });
  }, []);

  const syncAccountLocale = useCallback(async () => {
    const sequenceAtStart=writeSequence.current;
    try {
      const response = await fetch("/api/account/profile", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000) });
      if (!response.ok) return false;
      const body = await response.json();
      accountPreferenceEnabled.current = body.languagePreferenceEnabled === true;
      const preferred = body.profile?.preferredLocale;
      if (accountPreferenceEnabled.current && isLocale(preferred)) {
        if (writeSequence.current === sequenceAtStart) {
          chosenLocale.current = preferred;
          updateLocale(preferred);
          persistLocal(preferred);
        } else queueAccountPreference(chosenLocale.current,writeSequence.current);
      }
      return true;
    } catch {
      return false;
    }
  }, [persistLocal, queueAccountPreference]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    chosenLocale.current = next;
    persistLocal(next);
    triggerGoogleTranslate(next);
    const sequence = ++writeSequence.current;
    queueAccountPreference(next, sequence);
  }, [persistLocal, queueAccountPreference]);

  const value = useMemo(() => ({
    locale,
    setLocale,
    syncAccountLocale,
    t: (key: MessageKey) => message(locale, key)
  }), [locale, setLocale, syncAccountLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

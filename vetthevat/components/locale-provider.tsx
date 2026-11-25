"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { isLocale, localeDirection, message, registerTranslations, translationsLoaded, type Locale, type MessageKey } from "@/lib/i18n/catalog";
import { machineTranslationAllowed, protectBrandNames } from "@/lib/i18n/translate-scope";

const storageKey = "vtv.preferred-locale.v1";
type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void; syncAccountLocale: () => Promise<boolean>; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);

// The language saved on this device, or null when none has been chosen here.
function storedLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? document.cookie.split("; ").find((part) => part.startsWith("vtv_locale="))?.split("=")[1];
    const candidate = stored ? decodeURIComponent(stored) : "";
    return isLocale(candidate) ? candidate : null;
  } catch { return null; }
}

function readStoredLocale(): Locale {
  return storedLocale() ?? "en-GB";
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
  if (loc === "ro-RO") return "ro";
  return "en";
}

function setGoogleCookie(lang: string) {
  const host = window.location.hostname;
  const value = lang === "en" ? "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC" : `googtrans=/en/${lang}`;
  document.cookie = `${value}; path=/;`;
  if (host) { document.cookie = `${value}; domain=${host}; path=/;`; document.cookie = `${value}; domain=.${host}; path=/;`; }
}

// Loads Google's page translator once, on public pages only.
function loadGoogleTranslate() {
  const w = window as unknown as { googleTranslateElementInit?: () => void; google?: { translate?: { TranslateElement: new (options: object, id: string) => unknown } } };
  if (document.getElementById("google-translate-script")) return;
  w.googleTranslateElementInit = () => {
    if (w.google?.translate) new w.google.translate.TranslateElement({ pageLanguage: "en", includedLanguages: "gu,hi,es,ar,fr,de,pt,it,pl,ur,pa,ro,en", autoDisplay: false }, "google_translate_element");
  };
  const script = document.createElement("script");
  script.id = "google-translate-script";
  script.async = true;
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(script);
}

// Returns true when Google translates this page (whole sentences), so the
// word-level DOM translator must stay out of its way.
function triggerGoogleTranslate(loc: Locale, pathname: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const lang = localeToGoogleLang(loc);
  const translated = document.documentElement.classList.contains("translated-ltr") || document.documentElement.classList.contains("translated-rtl");
  if (lang === "en" || !machineTranslationAllowed(pathname)) {
    // Google was active if its script loaded, its cookie is set, or the page is marked translated.
    const googleActive = translated || Boolean(document.getElementById("google-translate-script")) || /(?:^|;\s*)googtrans=\/en\/[a-z]/.test(document.cookie);
    setGoogleCookie("en");
    // Google cannot cleanly undo a translated page; reload it in English. At most once every
    // 10 seconds, so a cookie that cannot be cleared can never cause a reload loop.
    if (googleActive) {
      let last = 0;
      try { last = Number(window.sessionStorage.getItem("vtv-english-reload") ?? 0); } catch { /* storage blocked */ }
      if (Date.now() - last > 10000) {
        try { window.sessionStorage.setItem("vtv-english-reload", String(Date.now())); } catch { /* storage blocked */ }
        window.location.reload();
      }
    }
    return false;
  }
  setGoogleCookie(lang);
  protectBrandNames(document.body);
  loadGoogleTranslate();
  const applySelect = () => {
    const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
    if (!select) return false;
    if (select.value !== lang) { select.value = lang; select.dispatchEvent(new Event("change")); }
    return true;
  };
  if (!applySelect()) {
    let attempts = 0;
    const interval = setInterval(() => { attempts++; if (applySelect() || attempts > 60) clearInterval(interval); }, 200);
  }
  // Safety net: Google's in-page switch sometimes does not take (slow network, busy
  // translator). If the page is still untranslated after a few seconds, reload it with
  // the language cookie set, which Google always applies on load. Once per language
  // every 20 seconds, so it can never loop.
  window.setTimeout(() => {
    const done = document.documentElement.classList.contains("translated-ltr") || document.documentElement.classList.contains("translated-rtl");
    const stillWanted = new RegExp(`(?:^|;\\s*)googtrans=/en/${lang}(?:;|$)`).test(document.cookie);
    if (done || !stillWanted || !machineTranslationAllowed(window.location.pathname)) return;
    const key = `vtv-translate-reload:${lang}`;
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(key) ?? 0); } catch { /* storage blocked */ }
    if (Date.now() - last < 20000) return;
    try { window.sessionStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ }
    window.location.reload();
  }, 5000);
  return true;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en-GB");
  const accountPreferenceEnabled = useRef(false);
  const writeSequence = useRef(0);
  const chosenLocale = useRef<Locale>("en-GB");
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pathname = usePathname();
  // Other languages and the word translator are downloaded only when a non-English
  // language is chosen, so English visitors never load them. version re-renders text
  // once a language file arrives.
  const [version, setVersion] = useState(0);
  const domTranslator = useRef<typeof import("@/lib/i18n/dom-translator") | null>(null);
  useEffect(() => {
    if (translationsLoaded(locale)) return;
    let active = true;
    void import("@/lib/i18n/catalog-translations").then((module) => {
      registerTranslations(locale, module.translationMaps(locale));
      if (active) setVersion((value) => value + 1);
    }).catch(() => { /* English text stays on screen if the language file cannot load */ });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    updateLocale(readStoredLocale());
  }, []);

  useEffect(() => {
    chosenLocale.current = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
    const google = triggerGoogleTranslate(locale, pathname);
    // Public pages: Google translates whole sentences; the word translator
    // would leave half-translated text ("कैप्चर every receipt").
    const wordLocale: Locale = google ? "en-GB" : locale;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (wordLocale === "en-GB" && !domTranslator.current) return; // nothing was ever translated
      const apply = (module: typeof import("@/lib/i18n/dom-translator")) => { if (!cancelled) module.applyDomTranslations(wordLocale); };
      if (domTranslator.current) apply(domTranslator.current);
      else void import("@/lib/i18n/dom-translator").then((module) => { domTranslator.current = module; apply(module); }).catch(() => undefined);
    }, 50);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [locale, pathname, version]);

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
      // The language chosen on this device (for example on the public site before signing in)
      // always wins and is saved to the account. The account's language is used only on a
      // device where no language has been chosen yet.
      const deviceChoice = storedLocale();
      if (accountPreferenceEnabled.current && deviceChoice) {
        if (preferred !== deviceChoice) queueAccountPreference(deviceChoice, writeSequence.current);
      } else if (accountPreferenceEnabled.current && isLocale(preferred)) {
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
    const sequence = ++writeSequence.current;
    queueAccountPreference(next, sequence);
  }, [persistLocal, queueAccountPreference]);

  // Public pages are translated by Google, which needs English text to work from. If the site
  // wrote its own translation there too, Google would keep showing a stale copy after a language
  // change (Arabic "Download app" stayed on a Hindi page). Signed-in pages never use Google, so
  // they show the site's own translations.
  const textLocale: Locale = pathname && machineTranslationAllowed(pathname) ? "en-GB" : locale;
  const value = useMemo(() => ({
    locale,
    setLocale,
    syncAccountLocale,
    t: (key: MessageKey) => message(textLocale, key)
  }), [locale, textLocale, setLocale, syncAccountLocale, version]); // eslint-disable-line react-hooks/exhaustive-deps -- version: a language file arrived

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}

// Shows business names (elements marked data-vtv-name) in the reader's script by sound, in the
// signed-in workspace: "Temple Wines" -> "टेम्पल वाइन्स" in Hindi. Google Translate skips these
// elements (translate="no"), so a name is never translated by meaning. Names are converted once by the
// server (/api/business/transliterate) and remembered on this device.
import type { Locale } from "@/lib/i18n/catalog";

export const SCRIPT_LOCALES: readonly Locale[] = ["hi-IN", "gu-IN", "pa-IN", "ur-PK", "ar"];
const LATIN = /[A-Za-z]{2}/;

function readCache(locale: Locale): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(`vtv.names.${locale}.v2`) ?? "{}") as Record<string, string>; } catch { return {}; }
}
function writeCache(locale: Locale, cache: Record<string, string>) {
  try { window.localStorage.setItem(`vtv.names.${locale}.v2`, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
}
function selectedCompany(): string | null {
  try { return (JSON.parse(window.sessionStorage.getItem("vtv.workspace-companies.v1") ?? "{}") as { selected?: string }).selected ?? null; } catch { return null; }
}

export function startNameScript(locale: Locale): () => void {
  const cache = readCache(locale);
  // Text node -> the English original and what we last wrote, so React's own updates are noticed.
  const original = new Map<Text, string>(), written = new Map<Text, string>();
  const pending = new Set<string>();
  let fetching = false, timer: number | undefined, stopped = false, csrf: string | null = null;

  const nodes = () => [...document.querySelectorAll("[data-vtv-name]")].flatMap((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), list: Text[] = [];
    while (walker.nextNode()) list.push(walker.currentNode as Text);
    return list;
  });

  function apply() {
    if (stopped) return;
    for (const node of nodes()) {
      const value = node.nodeValue ?? "";
      if (!original.has(node) || written.get(node) !== value) { original.set(node, value); written.delete(node); }
      const english = original.get(node)!, trimmed = english.trim();
      if (!trimmed || !LATIN.test(trimmed)) continue;
      const shown = cache[trimmed];
      if (shown === undefined) { pending.add(trimmed); continue; }
      const next = english.replace(trimmed, shown);
      if (node.nodeValue !== next) { node.nodeValue = next; written.set(node, next); }
    }
    if (pending.size && !fetching) void fetchPending();
  }

  async function fetchPending() {
    const company = selectedCompany();
    if (!company) return;
    fetching = true;
    try {
      while (pending.size && !stopped) {
        const batch = [...pending].slice(0, 100);
        batch.forEach((name) => pending.delete(name));
        if (!csrf) { const session = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }); csrf = session.ok ? ((await session.json()) as { csrfToken?: string }).csrfToken ?? null : null; }
        if (!csrf) break;
        const response = await fetch("/api/business/transliterate", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", "x-company-id": company, "x-csrf-token": csrf }, body: JSON.stringify({ locale, names: batch }) });
        if (!response.ok) break;
        const data = ((await response.json()) as { data?: { names?: string[]; original?: string[] } }).data;
        (data?.original ?? []).forEach((name, index) => { const shown = data?.names?.[index]; if (shown) cache[name] = shown; });
        writeCache(locale, cache);
      }
    } catch { /* names stay in English if the service is unavailable */ }
    finally { fetching = false; if (!stopped) apply(); }
  }

  const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(apply, 250); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  apply();

  return () => {
    stopped = true; observer.disconnect(); window.clearTimeout(timer);
    // Back to the English names (for example after switching to English).
    for (const [node, english] of original) if (written.get(node) === node.nodeValue) node.nodeValue = english;
  };
}

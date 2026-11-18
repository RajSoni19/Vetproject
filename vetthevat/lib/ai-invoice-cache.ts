// Remembers AI readings in this browser for 24 hours, so a retry or re-upload of
// the same files does not call (or pay for) the AI again. Only the extracted JSON
// is kept, never the image. Keys are scoped to the company and the exact files.
import { parseAiInvoice, type AiInvoice } from "@/lib/ai-invoice";

export const AI_CACHE_TTL_MS = 86400000;
const PREFIX = "vtv-ai-invoice:v1:", MAX_ENTRIES = 50;
type CacheStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type CachedReading = { invoice: AiInvoice; pageCount: number };

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (data: BufferSource) => hex(await crypto.subtle.digest("SHA-256", data));

export async function aiCacheKey(companyId: string, files: readonly Blob[]) {
  const hashes: string[] = [];
  for (const file of files) hashes.push(await sha256(await file.arrayBuffer()));
  return PREFIX + await sha256(new TextEncoder().encode(`${companyId}\n${hashes.join("\n")}`));
}

function entries(store: CacheStore) {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index++) { const key = store.key(index); if (key?.startsWith(PREFIX)) keys.push(key); }
  return keys.map((key) => { let at = 0; try { at = Number(JSON.parse(store.getItem(key) ?? "{}").at) || 0; } catch { /* removed below as expired */ } return { key, at }; });
}

export function readAiCache(store: CacheStore, key: string, now = Date.now()): CachedReading | null {
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { at?: unknown; pageCount?: unknown; invoice?: unknown };
    if (typeof value.at === "number" && now - value.at < AI_CACHE_TTL_MS && typeof value.pageCount === "number") return { invoice: parseAiInvoice(value.invoice), pageCount: value.pageCount };
  } catch { /* unreadable entries are removed */ }
  store.removeItem(key);
  return null;
}

export function writeAiCache(store: CacheStore, key: string, reading: CachedReading, now = Date.now()) {
  const current = entries(store);
  for (const entry of current) if (now - entry.at >= AI_CACHE_TTL_MS) store.removeItem(entry.key);
  const live = current.filter((entry) => now - entry.at < AI_CACHE_TTL_MS && entry.key !== key).sort((a, b) => a.at - b.at);
  for (const entry of live.slice(0, Math.max(0, live.length - MAX_ENTRIES + 1))) store.removeItem(entry.key);
  store.setItem(key, JSON.stringify({ at: now, ...reading }));
}

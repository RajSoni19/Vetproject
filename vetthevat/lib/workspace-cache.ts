// Remembers the signed-in person's company list for this browser tab, so reloads and repeat
// visits show the company and start loading its data at once instead of waiting for the access
// checks. It holds only company ids, names and roles: the server still checks access on every
// data request, and the list is re-checked in the background each time the workspace opens.
// It is cleared on sign-in, sign-out and session expiry so one person's list never shows for another.
const key = "vtv.workspace-companies.v1";

export type CachedCompanies = { companies: { id: string; name: string; role: string }[]; selected: string };

export function readWorkspaceCache(): CachedCompanies | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    if (!value || !Array.isArray(value.companies) || typeof value.selected !== "string") return null;
    const companies = value.companies.filter((c: unknown): c is CachedCompanies["companies"][number] => {
      const x = c as Record<string, unknown>;
      return Boolean(x) && typeof x.id === "string" && typeof x.name === "string" && typeof x.role === "string";
    });
    return companies.length && companies.some((c: { id: string }) => c.id === value.selected) ? { companies, selected: value.selected } : null;
  } catch { return null; }
}

export function writeWorkspaceCache(value: CachedCompanies) {
  try {
    if (value.companies.length && value.selected) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch { /* storage blocked: the workspace simply loads without it */ }
}

export function clearWorkspaceCache() {
  try { window.sessionStorage.removeItem(key); } catch { /* storage blocked */ }
}

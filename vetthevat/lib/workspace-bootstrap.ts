import type { Workspace } from "@/lib/workspace";
import { restoreWorkspace, workspaceStorageKey } from "@/lib/workspace";

export function emptyWorkspace(): Workspace {
  return {
    customers: [],
    companies: [],
    invoices: [],
    documents: [],
    suppliers: [],
    tickets: [],
    auditLog: [],
    notifications: [],
    teamMembers: [],
    selectedCompanyId: "",
    settings: {}
  };
}

// Identity-only historical references for USER REVIEW, not seeded records or
// proof of origin. Names, amounts, dates and unchanged content never authorize
// deletion. Even exact old fixtures may have become genuine dependencies.
const legacyIds = {
  companies: ["company-demo-business", "company-retail"],
  suppliers: ["supplier-abc", "supplier-northbridge", "supplier-westfield"],
  documents: ["doc-abc-1025", "doc-northbridge-8804", "doc-westfield-4481"],
  invoices: ["invoice-1025", "invoice-8804", "invoice-4481", "invoice-1025-duplicate"],
  tickets: ["SUP-2048", "SUP-2039"], teamMembers: ["team-1", "team-2", "team-3"],
  notifications: ["note-1", "note-2", "note-3"],
  auditLog: ["audit-global-1", "audit-global-2", "audit-global-3", "audit-global-4"]
} as const;

export function legacyRecordReview(workspace: Workspace) {
  const kinds = Object.keys(legacyIds) as (keyof typeof legacyIds)[];
  return kinds.flatMap(kind => workspace[kind].filter(row => (legacyIds[kind] as readonly string[]).includes(row.id)).map(row => ({ kind, id: row.id, companyId: "companyId" in row ? row.companyId : undefined, label: "name" in row ? String(row.name) : "invoiceNumber" in row ? String(row.invoiceNumber) : "fileName" in row ? String(row.fileName) : row.id, reason: "Historical identity only; may contain genuine edits. Preserve unless explicitly reviewed." })));
}

export function loadLocalWorkspace(storage: Pick<Storage, "getItem">) {
  // Read-only hydration. Never clear, migrate, filter, seed or rewrite storage on
  // page load, refresh, sign-out or backend failure. Fresh storage stays untouched.
  return restoreWorkspace(storage.getItem(workspaceStorageKey), emptyWorkspace());
}

export function exportLocalWorkspace(storage: Pick<Storage, "getItem">) {
  // Exact original metadata, including unknown fields. This is an explicit local
  // export, never a network operation. Original file bytes may be unavailable.
  return storage.getItem(workspaceStorageKey) ?? JSON.stringify(emptyWorkspace());
}

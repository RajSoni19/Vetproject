import type { OrsState } from "@/lib/ors/contracts";
export function emptyOrsWorkspace(): OrsState {
  return { materials: [], suppliers: [], requests: [], orders: [], receipts: [], movements: [], history: [], attachments: [] };
}

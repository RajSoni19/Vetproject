import type { AuditEvent } from "@/lib/domain";
import { parseInvoiceDate } from "@/lib/invoice-rules";
export type ActivityFilters = { query?: string; action?: string; dateFrom?: string; dateTo?: string };
export function filterActivity(events: AuditEvent[], companyId: string, filters: ActivityFilters = {}) {
  const from=filters.dateFrom ? parseInvoiceDate(filters.dateFrom) : "";
  const to=filters.dateTo ? parseInvoiceDate(filters.dateTo) : "";
  if(from===null||to===null)throw new Error("Enter valid activity filter dates.");
  if(from&&to&&from>to)throw new Error("Start date must be on or before end date.");
  const query=(filters.query??"").trim().toLowerCase();
  return events.filter(event=>{
    if(event.companyId!==companyId)return false;
    const date=/^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(event.createdAt) ? parseInvoiceDate(event.createdAt.slice(0,10)) : null;
    return (!filters.action||event.action===filters.action)
      && (!(from||to)||Boolean(date&&(!from||date>=from)&&(!to||date<=to)))
      && `${event.user} ${event.action} ${event.entity} ${event.details}`.toLowerCase().includes(query);
  });
}

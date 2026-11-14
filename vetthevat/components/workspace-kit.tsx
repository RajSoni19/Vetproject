import { Badge } from "@/components/ui/card";
import { type InvoiceStatus } from "@/lib/domain";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "Reviewed" || status === "Processed" || status === "Active" || status === "Resolved" ? "green" : status === "Duplicate Warning" || status === "Processing Failed" || status === "Overdue" ? "red" : status === "Pending Review" || status === "In Progress" || status === "Review" || status === "Needs Review" ? "amber" : "grey";
  return <Badge tone={tone as "green" | "amber" | "red" | "grey"}>{status}</Badge>;
}

export function statusMatches(status: InvoiceStatus | string, filter: string) {
  return filter === "All" || status === filter;
}

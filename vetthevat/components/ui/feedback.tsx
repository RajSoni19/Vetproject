import { AlertCircle, CheckCircle2, Inbox, Loader2, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Feedback({ kind = "empty", title, children, action }: { kind?: "loading" | "empty" | "error" | "success" | "permission"; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = { loading: Loader2, empty: Inbox, error: AlertCircle, success: CheckCircle2, permission: ShieldOff }[kind];
  return <div role={kind === "error" ? "alert" : kind === "loading" || kind === "success" ? "status" : undefined} className={cn("feedback", "feedback-" + kind)}><Icon aria-hidden="true" className={cn("h-5 w-5 shrink-0", kind === "loading" && "animate-spin")} /><div className="min-w-0"><p className="font-semibold">{title}</p>{children ? <div className="mt-1 text-sm leading-6 text-muted">{children}</div> : null}{action ? <div className="mt-3">{action}</div> : null}</div></div>;
}

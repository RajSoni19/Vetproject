"use client";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function TextField({ label, error, help, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; help?: string }) {
  const generated = useId(), id = props.id ?? generated;
  return <label htmlFor={id} className="grid min-w-0 gap-2 text-sm font-medium">{label}<input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={error || help ? id + "-hint" : undefined} className={cn("field-control", className)} />{error || help ? <span id={id + "-hint"} className={cn("text-xs font-normal leading-5", error ? "text-red-700" : "text-muted")}>{error || help}</span> : null}</label>;
}

export function SelectField({ label, children, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId(), id = props.id ?? generated;
  return <label htmlFor={id} className="grid min-w-0 gap-2 text-sm font-medium">{label}<select {...props} id={id} className={cn("field-control", className)}>{children}</select></label>;
}

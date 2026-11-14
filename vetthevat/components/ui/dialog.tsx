"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Dialog({ title, onClose, children, drawer = false }: { title: string; onClose: () => void; children: React.ReactNode; drawer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), titleId = useId();
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const controls = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])];
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const list = controls(), first = list[0], last = list[list.length - 1];
      if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className={drawer ? "dialog-backdrop dialog-drawer" : "dialog-backdrop"} onClick={(event) => { if (event.target === event.currentTarget) close.current(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={drawer ? "dialog-panel drawer-panel" : "dialog-panel"}><div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4"><h2 id={titleId} className="font-semibold">{title}</h2><Button type="button" variant="ghost" className="h-10 w-10 px-0" aria-label={drawer ? "Close navigation" : "Close dialog"} onClick={onClose}><X className="h-5 w-5" /></Button></div>{children}</div></div>;
}

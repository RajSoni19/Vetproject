"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { CheckCircle2, Info } from "lucide-react";

type Toast = { id: number; title: string; description?: string; tone?: "success" | "info" };
const ToastContext = createContext<{ showToast: (toast: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const value = useMemo(
    () => ({
      showToast: (toast: Omit<Toast, "id">) => {
        const id = Date.now();
        setToasts((current) => [...current, { id, ...toast }]);
        window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-32px))] gap-3">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className="flex gap-3 rounded-lg border border-line bg-white p-4 shadow-soft">
            {toast.tone === "success" ? <CheckCircle2 className="h-5 w-5 text-brand-500" /> : <Info className="h-5 w-5 text-sky-600" />}
            <div>
              <p className="font-semibold text-ink">{toast.title}</p>
              {toast.description ? <p className="mt-1 text-sm text-muted">{toast.description}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

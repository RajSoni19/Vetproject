"use client";
// Password field with a show/hide (eye) button. Drop-in for <input type="password">.
import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ className = "", disabled, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return <span className="relative block w-full">
    <input {...props} disabled={disabled} type={visible ? "text" : "password"} className={`${className} w-full pr-12`} />
    <button type="button" disabled={disabled} onClick={() => setVisible(value => !value)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}
      className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50">
      {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
    </button>
  </span>;
}

import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary text-white shadow-subtle hover:brightness-95",
        variant === "secondary" && "bg-ink text-white hover:brightness-110",
        variant === "ghost" && "bg-transparent text-ink hover:bg-wash",
        variant === "outline" && "border border-line bg-white text-ink hover:border-brand-500 hover:text-brand-700",
        className
      )}
      {...props}
    />
  );
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  className?: string;
  children: React.ReactNode;
};

export function ButtonLink({ className, variant = "primary", children, ...props }: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
        variant === "primary" && "bg-primary text-white shadow-subtle hover:brightness-95",
        variant === "secondary" && "bg-ink text-white hover:brightness-110",
        variant === "ghost" && "bg-transparent text-ink hover:bg-wash",
        variant === "outline" && "border border-line bg-white text-ink hover:border-brand-500 hover:text-brand-700",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-[0.02em]" aria-label="VET THE VAT home">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-500 text-white">V</span>
      <span>VET THE VAT</span>
    </Link>
  );
}

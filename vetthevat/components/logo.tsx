"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoSrc } from "@/lib/site-links";

// Shows the company logo from public/brand/logo.png, or the "V" badge if the file is missing.
export function Logo() {
  const [imageMissing, setImageMissing] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  // The image may fail before the page is interactive, when onError is not yet attached.
  useEffect(() => { const img = image.current; if (img && img.complete && img.naturalWidth === 0) setImageMissing(true); }, []);
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-[0.02em]" aria-label="VET THE VAT home">
      {imageMissing
        ? <span className="grid h-9 w-9 place-items-center rounded-md bg-brand-500 text-white">V</span>
        // eslint-disable-next-line @next/next/no-img-element -- a plain image keeps the missing-file fallback simple
        : <img ref={image} src={logoSrc} alt="" width={36} height={36} className="h-9 w-9 rounded-md object-contain" onError={() => setImageMissing(true)} />}
      <span translate="no" className="notranslate">VET THE VAT</span>
    </Link>
  );
}

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Google Translate (language switcher) is allowed on public marketing pages
// only. Signed-in pages keep the strict policy so customer invoice and
// financial data is never sent to a translation service.
const translate = {
  script: " https://translate.google.com https://translate.googleapis.com https://translate-pa.googleapis.com https://www.gstatic.com",
  style: " https://www.gstatic.com https://translate.googleapis.com",
  connect: " https://translate.googleapis.com https://translate-pa.googleapis.com https://translate.google.com",
  frame: " https://translate.google.com https://translate.googleapis.com"
};

function securityHeaders(allowTranslate: boolean) {
  const extra = (part: keyof typeof translate) => allowTranslate ? translate[part] : "";
  return [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://challenges.cloudflare.com${extra("script")}${isDev ? " 'unsafe-eval'" : ""}`,
        `style-src 'self' 'unsafe-inline'${extra("style")}`,
        "img-src 'self' blob: data: https:",
        "font-src 'self' data:",
        `connect-src 'self' blob: https://challenges.cloudflare.com${extra("connect")}`,
        "worker-src 'self' blob:",
        `frame-src 'self' blob: https://challenges.cloudflare.com${extra("frame")}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
      ].join("; ")
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }
  ];
}
// Kept in sync with lib/i18n/translate-scope.ts.
const privateRoutes = ["/super-admin/:path*", "/super-admin", "/api/:path*", "/reset-password/:path*", "/reset-password", "/verify-email/:path*", "/verify-email"];

const nextConfig: NextConfig = {
  // Explicit local build limit for constrained Windows worker processes.
  // Unset preserves Next's default production/deployment behavior.
  experimental: process.env.VETTHEVAT_BUILD_SINGLE_WORKER === "1" ? { cpus: 1 } : undefined,
  // Opt-in for Linux container builds; preserve the current Windows dev output.
  output: process.env.VETTHEVAT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // The guarded local build runs the project TypeScript CLI first, then asks
  // Next to skip its nested checker (which cannot spawn in this Windows sandbox).
  typescript: process.env.VTV_LOCAL_TYPECHECKED_BUILD === "1" ? { ignoreBuildErrors: true } : undefined,
  async headers() {
    // Later entries override earlier ones for the same header key.
    return [
      { source: "/(.*)", headers: securityHeaders(true) },
      ...privateRoutes.map((source) => ({ source, headers: securityHeaders(false) })),
      // OCR engine and language data (~14 MB) never change: cache in the browser
      // and on Vercel's CDN so invoice reading starts instantly after the first time.
      { source: "/ocr/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] }
    ];
  }
};

export default nextConfig;

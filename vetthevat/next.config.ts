import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https:",
      "font-src 'self' data:",
      "connect-src 'self' blob: https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "frame-src 'self' blob: https://challenges.cloudflare.com",
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
    return [
      {
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

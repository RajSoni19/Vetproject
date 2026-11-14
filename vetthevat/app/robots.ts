import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/lib/site-origin";

export default function robots(): MetadataRoute.Robots {
  const origin = publicSiteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/$",
        "/about",
        "/benefits",
        "/features",
        "/how-it-works",
        "/mobile-app",
        "/pricing",
        "/plan-information",
        "/faq",
        "/support",
        "/contact",
        "/security",
        "/product",
        "/privacy",
        "/terms"
      ],
      disallow: "/"
    },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined
  };
}

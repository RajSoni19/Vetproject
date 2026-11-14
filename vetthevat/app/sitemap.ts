import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicSiteOrigin();
  if (!origin) return [];
  return ["/", "/about", "/benefits", "/features", "/how-it-works", "/mobile-app", "/pricing", "/plan-information", "/faq", "/support", "/contact", "/security", "/product"].map((route) => ({
    url: `${origin}${route}`,
    lastModified: new Date("2026-10-08")
  }));
}

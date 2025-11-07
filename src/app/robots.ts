// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const isProd = process.env.NODE_ENV === "production";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    rules: isProd
      ? {
          userAgent: "*",
          allow: "/",
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
    sitemap: isProd ? [`${site}/sitemap.xml`] : [],
    host: isProd ? site : undefined,
  };
}

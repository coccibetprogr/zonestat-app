// next.config.ts
import type { NextConfig } from "next";

if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error("NEXT_PUBLIC_SITE_URL must be set in production for CSRF checks.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

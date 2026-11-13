import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /finn-api/* is handled by src/app/finn-api/[...path]/route.ts
  // (proxies to FINN_API_ORIGIN or local :8000, with embedded live-quote fallback)
};

export default nextConfig;

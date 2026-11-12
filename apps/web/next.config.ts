import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@wasla/shared"],

  // Keep Better Auth on the WASLA domain so browser cookies remain first-party.
  // Next.js proxies these requests to the separate API service.
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination:
          "https://wasla-apiwasla-api-v2.onrender.com/api/auth/:path*",
      },
    ];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  transpilePackages: ["@wasla/shared"],

  // Apply conservative browser security headers to every web route.
  // CSP is intentionally not set here until all third-party/auth/media origins
  // are inventoried, so we do not break legitimate production flows.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // Keep Better Auth on the WASLA domain so browser cookies remain first-party.
  // Next.js proxies these requests to the separate API service.
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination:
          "https://wasla-apiwasla-api-v2.onrender.com/api/auth/:path*",
      },
      {
        // Public member-store and product catalogue reads are served by the API.
        source: "/api/public/:path*",
        destination:
          "https://wasla-apiwasla-api-v2.onrender.com/api/public/:path*",
      },
      {
        // Member-store order, return-policy and storefront APIs share this prefix.
        source: "/api/stores/:path*",
        destination:
          "https://wasla-apiwasla-api-v2.onrender.com/api/stores/:path*",
      },
    ];
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  poweredByHeader: false,

  compress: true,

  productionBrowserSourceMaps: false,

  transpilePackages: ["@wasla/shared"],

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: []
  }
};

export default nextConfig;

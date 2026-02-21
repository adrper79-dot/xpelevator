import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloudflare Pages static image delivery
  images: {
    unoptimized: true,
  },
  // Disable experimental features that might cause issues
  experimental: {
    // Disable turbopack for production builds
    turbopack: false,
  },
};

export default nextConfig;

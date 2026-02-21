import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloudflare Pages static image delivery
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  // Required for Cloudflare Pages static image delivery
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

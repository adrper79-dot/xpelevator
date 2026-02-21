import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Cloudflare Pages static image delivery
  images: {
    unoptimized: true,
  },
  // eslint-config-next@15 exports legacy ESLint v8 format, incompatible with
  // ESLint v9 flat config used in eslint.config.mjs. Skip lint during build;
  // run `npm run lint` separately for code quality checks.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

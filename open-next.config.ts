import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Disable incremental cache for Cloudflare (use dummy implementation)
  incrementalCache: "dummy",
  // Disable tag cache for Cloudflare
  tagCache: "dummy",
  // Queue for ISR (not needed for this app)
  queue: "dummy",
  // Disable streaming for better compatibility
  streaming: false,
});
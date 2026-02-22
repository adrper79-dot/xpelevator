// ── Prisma client with Neon HTTP adapter ────────────────────────────────────
//
// IMPORTANT: Must import from '@prisma/client/edge', NOT '@prisma/client'.
//
// '@prisma/client' loads runtime/library.js which requires a native .node binary
// (libquery_engine-*.so.node). Cloudflare Workers does NOT support native Node.js
// addons — every DB call will 500 in production if the standard import is used.
//
// '@prisma/client/edge' loads runtime/edge.js → query_engine_bg.wasm, which runs
// in both CF Workers (production) and Node.js (local dev). Prisma 5+ / 6+ made the
// /edge export safe to use in Node.js too — it auto-detects the runtime.
//
// References:
//   https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-cloudflare-workers
import { PrismaClient } from '@prisma/client/edge';
import { PrismaNeonHTTP } from '@prisma/adapter-neon';

function createPrismaClient() {
  // Strip CR chars that appear when .env has CRLF line endings (Windows dev)
  const url = process.env.DATABASE_URL?.replace(/\r/g, '');
  if (!url) throw new Error('DATABASE_URL is not set');

  console.log('DATABASE_URL available:', !!url);
  console.log('DATABASE_URL starts with:', url.substring(0, 20) + '...');

  // PrismaNeonHTTP uses the Neon HTTP API — works in both Node.js and CF Workers
  const adapter = new PrismaNeonHTTP(url, {});
  return new PrismaClient({ adapter });
}

// Reuse across hot-reloads in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

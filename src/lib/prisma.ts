// ── Prisma client with Neon HTTP adapter ────────────────────────────────────
//
// IMPORTANT: Must import from '@prisma/client', NOT '@prisma/client/edge'.
//
// When a driver adapter is configured (see driverAdapters previewFeature in
// schema.prisma), ALL queries are routed through the adapter — Prisma never
// touches the native .node query engine binary. The '/edge' import explicitly
// throws PrismaClientValidationError when used together with an adapter option.
//
// '@prisma/adapter-neon' uses the Neon HTTP API (fetch), which is available in
// both Cloudflare Workers and Node.js — making this safe for CF deployment too.
//
// References:
//   https://www.prisma.io/docs/orm/prisma-client/deployment/edge/deploy-to-cloudflare-workers#neon-http-adapter
import { PrismaClient } from '@prisma/client';
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

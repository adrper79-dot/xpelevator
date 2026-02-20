# XPElevator — Engineering Guide

This document is the primary reference for developers working on XPElevator. It covers environment setup, conventions, project structure, and operational runbooks.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Project Structure](#project-structure)
4. [Environment Variables](#environment-variables)
5. [Database Management](#database-management)
6. [Code Conventions](#code-conventions)
7. [API Design Conventions](#api-design-conventions)
8. [Branching & Git Workflow](#branching--git-workflow)
9. [Deployment](#deployment)
10. [Debugging Guide](#debugging-guide)
11. [Common Tasks](#common-tasks)

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20+ (LTS) | Runtime (Windows native preferred, not WSL) |
| npm | 10+ | Package manager |
| Git | Any | Source control |
| VS Code | Latest | Editor (recommended) |

> **Windows Note**: Always run `npm install` and `npx prisma generate` from a **native Windows terminal** (cmd.exe or PowerShell), not WSL. WSL filesystem access to NTFS causes `EACCES`/`EPERM` errors with certain binary packages (`@next/swc-win32-x64-msvc`).

---

## Local Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/adrper79-dot/xpelevator.git
cd xpelevator

# 2. Install dependencies (Windows cmd or PowerShell — NOT WSL)
npm install

# 3. Copy environment template
cp .env.example .env
# — Fill in your values (see Environment Variables section)

# 4. Generate Prisma client
npx prisma generate

# 5. Start the dev server (Turbopack)
npm run dev
```

App runs at **http://localhost:3000**.

### First-time Database Setup

The Neon database already has the schema applied. If you need to re-apply:
```bash
# Introspect existing schema (do NOT run prisma migrate on Neon production without a temp branch)
npx prisma db pull

# Or push schema changes to a dev/branch database
npx prisma db push
```

See [Database Management](#database-management) for details on the Neon branching strategy.

---

## Project Structure

```
xpelevator/
├── prisma/
│   └── schema.prisma         # Single source of truth for DB schema
├── src/
│   ├── app/                  # Next.js App Router pages & API routes
│   │   ├── page.tsx          # Home / landing page
│   │   ├── layout.tsx        # Root layout (fonts, metadata)
│   │   ├── globals.css       # Global CSS (Tailwind v4 imports)
│   │   ├── admin/            # Admin panel (criteria CRUD)
│   │   ├── sessions/         # Past simulation sessions
│   │   ├── simulate/         # Simulation launcher & active session UI
│   │   │   ├── page.tsx      # Job + scenario selector
│   │   │   └── [sessionId]/  # Active simulation (chat/phone UI)
│   │   └── api/              # Route handlers
│   │       ├── jobs/         # GET/POST job titles
│   │       ├── criteria/     # GET/POST + [id] PUT/DELETE criteria
│   │       ├── simulations/  # GET/POST sessions
│   │       ├── scoring/      # POST scores
│   │       └── chat/         # POST/GET chat messages (SSE streaming)
│   └── lib/
│       ├── prisma.ts         # Prisma client singleton
│       └── ai.ts             # Groq/AI client wrapper
├── docs/
│   ├── ARCHITECTURE.md       # C4 diagrams
│   ├── ENGINEERING.md        # This file
│   ├── ROADMAP.md            # Plan, gaps, priorities
│   └── tech/                 # Per-technology reference docs
├── .env                      # Local secrets (never commit)
├── .env.example              # Template (commit this)
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # (if needed — v4 uses CSS variables)
└── package.json
```

---

## Environment Variables

All secrets live in `.env` (never committed). Use `.env.example` as the template.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon Postgres connection string (pooled endpoint) |
| `GROQ_API_KEY` | ✅ | Groq API key for AI virtual customer |
| `GROK_API_KEY` | ⬜ | xAI Grok API key (alternative AI provider) |
| `TELNYX_API_KEY` | ⬜ | Telnyx API key for phone simulations |
| `TELNYX_CONNECTION_ID` | ⬜ | Telnyx SIP connection / call control app ID |
| `CLOUDFLARE_API_TOKEN` | ⬜ | Cloudflare API token for Pages/Workers deployment |
| `CLOUDFLARE_ACCOUNT_ID` | ⬜ | Cloudflare account ID |
| `NEXTAUTH_SECRET` | ⬜ | NextAuth.js secret (future: when auth is added) |
| `NEXTAUTH_URL` | ⬜ | App URL for NextAuth callbacks |

### Neon Connection String Format
```
postgresql://neondb_owner:<password>@<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require
```
Use the **pooler** endpoint (port 5432) for all application connections. Use the **direct** endpoint only for migrations.

---

## Database Management

### Neon Project
- **Project ID**: `aged-butterfly-52244878`
- **Database**: `neondb`
- **Region**: `us-east-1`
- **Primary branch**: `main`

### Workflow: Schema Changes

Always use **Neon branches** to test schema changes before applying to production:

```bash
# 1. Create a branch in Neon console (or via MCP/API)
# 2. Set DATABASE_URL to the branch connection string
# 3. Test the schema change
npx prisma db push

# 4. Verify with introspection
npx prisma db pull

# 5. After validation, re-set DATABASE_URL to main
# 6. Apply to production
npx prisma db push   # or coordinate with DBA
```

### Prisma Migrations (future)
When the project matures, switch from `db push` to migration files:
```bash
npx prisma migrate dev --name <description>   # dev
npx prisma migrate deploy                     # production
```

### Seed Data
Seed data was applied directly via Neon MCP SQL tool. For future use, add a `prisma/seed.ts` file:
```ts
// prisma/seed.ts
import prisma from '../src/lib/prisma';
// ... insert seed records
```
Then add to `package.json`:
```json
"prisma": { "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts" }
```

---

## Code Conventions

### TypeScript
- **Strict mode** enabled (`strict: true` in tsconfig)
- Prefer `interface` over `type` for object shapes
- Avoid `any`; use `unknown` and narrow
- API response types should be co-located with their consumers or in `src/types/`

### React / Next.js
- **Server Components by default** — only add `'use client'` when you need interactivity, browser APIs, or hooks
- Data fetching in server components uses `fetch()` or Prisma directly (no API round-trip needed)
- Client components fetch data via the API routes
- Keep components small and focused; extract logic to hooks in `src/hooks/`

### File Naming
- Pages: `page.tsx` (Next.js App Router requirement)
- Route handlers: `route.ts`
- Components: `PascalCase.tsx`
- Utilities / lib: `camelCase.ts`
- Types: `src/types/index.ts` (barrel file)

### Styling (Tailwind CSS v4)
- Use Tailwind utility classes directly in JSX — no separate CSS modules
- Group related utilities with consistent ordering: layout → sizing → spacing → colors → typography → interactive states
- Dark theme uses `slate-900` / `blue-950` gradient backgrounds, `slate-800` cards, `blue-400`/`blue-500` accents
- See [tech/TAILWIND.md](tech/TAILWIND.md) for v4-specific patterns

### Error Handling
- API routes: always `try/catch`, return `NextResponse.json({ error: '...' }, { status: 5xx })`
- Client components: maintain `error` state alongside `loading` state
- Never expose stack traces to the client

---

## API Design Conventions

All API routes are under `src/app/api/`. Route handlers use `NextResponse`.

### Standard Response Shapes

```ts
// Success (list)
Response: T[]  // or { data: T[], meta: { total, page } } for paginated

// Success (single)
Response: T

// Error
Response: { error: string }
Status: 400 (bad input) | 401 (unauthorized) | 404 (not found) | 500 (server error)
```

### Route Handler Pattern

```ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // ... query prisma
    return NextResponse.json(data);
  } catch (error) {
    console.error('[route name] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
```

### Dynamic Routes

```
/api/criteria/[id]/route.ts  →  export async function PUT(req, { params }: { params: Promise<{ id: string }> })
```
> **Next.js 15+ note**: `params` in route handlers is now a `Promise`. Always `await params` before accessing properties.

---

## Branching & Git Workflow

```
main          — production-ready, deploys to Cloudflare Pages
develop       — integration branch, staging deploys
feature/*     — feature branches (e.g., feature/chat-simulation)
fix/*         — bug fixes
docs/*        — documentation updates
```

### Commit Message Format
```
type(scope): short description

feat(chat): add streaming AI response to simulation
fix(admin): prevent empty criteria name on save
docs(engineering): add branching guide
refactor(api): consolidate error handling in route handlers
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

---

## Deployment

### Cloudflare Pages (target)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login
wrangler login

# Deploy (from project root)
npx wrangler pages deploy .next --project-name xpelevator
```

> **Note**: Cloudflare Pages supports Next.js via the `@cloudflare/next-on-pages` adapter. Requires `edge` runtime for API routes that run in Workers. See [tech/CLOUDFLARE.md](tech/CLOUDFLARE.md).

### Environment Variables in Cloudflare
Set via Cloudflare dashboard → Pages → Settings → Environment Variables, or:
```bash
wrangler pages secret put DATABASE_URL
```

### Build Settings
| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Build output | `.next` |
| Node.js version | 20.x |

---

## Debugging Guide

### Dev Server Won't Start
```bash
# Kill any process on port 3000
npx kill-port 3000
# Re-start
npm run dev
```

### Prisma Errors

**`Can't reach database server`**
- Check `DATABASE_URL` in `.env`
- Neon free tier suspends after inactivity — first connection may take 3-5 seconds (cold start)

**`Unknown field in Prisma query`**
```bash
npx prisma generate   # regenerate client after schema changes
```

**`P2002 Unique constraint violation`**
- Check for duplicate `name` field on `JobTitle` or `Criteria`

### TypeScript Errors in VS Code
- Ghost errors from deleted files → reload VS Code window: `Ctrl+Shift+P` → "Developer: Reload Window"

### Windows / WSL npm Issues
- **Never** run `npm install` from WSL when the project is on a Windows NTFS drive
- Use Windows cmd.exe or PowerShell for all npm/node commands
- If `node_modules` appears corrupt: delete it from PowerShell (`Remove-Item -Recurse -Force node_modules`), then re-run `npm install` from cmd.exe

---

## Common Tasks

### Add a New API Route

1. Create `src/app/api/<resource>/route.ts`
2. Export `GET`, `POST` etc handlers
3. Add corresponding types if needed in `src/types/`
4. Update `docs/ARCHITECTURE.md` if it changes the system design

### Add a New Page

1. Create `src/app/<path>/page.tsx`
2. If it needs data from DB on server → use Prisma directly (server component)
3. If it needs interactivity → `'use client'` + fetch from API route
4. Add a navigation link from the home page or layout

### Modify the Database Schema

1. Edit `prisma/schema.prisma`
2. `npx prisma generate` to update the client
3. `npx prisma db push` (against a Neon dev branch first)
4. Update seed data if necessary

### Add a New AI Prompt

1. Edit `src/lib/ai.ts`
2. Add a new exported function with a well-typed signature
3. Keep system prompts as constants at the top of the file
4. Document the prompt purpose and expected output format

### Run a Manual DB Query (via Neon MCP)
Use the Neon MCP tool (`mcp_neon_run_sql`) with project ID `aged-butterfly-52244878`.

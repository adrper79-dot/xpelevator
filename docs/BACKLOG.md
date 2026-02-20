# XPElevator — Product & Engineering Backlog

Last evaluated: 2026-02-19 (updated 2026-02-21)  
Format: `[ID] Title — Priority | Status | Notes`

---

## Legend

| Priority | Meaning |
|----------|---------|
| 🔴 Critical | Blocks core functionality or causes errors |
| 🟠 High | Important feature gap, no workaround |
| 🟡 Medium | Notable UX gap, workaround exists |
| 🟢 Low | Nice-to-have, infrastructure, future |

| Status | Meaning |
|--------|---------|
| `open` | Not started |
| `in-progress` | Being actively built |
| `done` | Completed and merged |
| `blocked` | Waiting on external dependency |

---

## 🔴 Critical

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-001 | Delete stale `src/index.ts` (old Cloudflare MCP server) | `done` | Excluded via tsconfig; should be physically deleted |
| BL-002 | Set `GROQ_API_KEY` in `.env` from secrets.txt | `blocked` | User action required — copy key from secrets.txt |
| BL-003 | `groq-sdk` package install | `done` | Installed via Windows cmd.exe |
| BL-004 | Fix JSX fragment error in `simulate/page.tsx` | `done` | Missing `<>` wrapper around ternary else branch |
| BL-005 | Fix implicit `any` in `chat/route.ts` map callbacks | `done` | Added explicit type annotations |

---

## 🟠 High Priority

### Admin — Missing Management Features
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-010 | Admin: Job Title management (list, create, edit, delete) | `done` | Tab 2 in new tabbed admin page |
| BL-011 | Admin: Scenario management (list, create, edit, delete) | `done` | Tab 3 with job title filter |
| BL-012 | Admin: Scenario script editor (persona, objective, difficulty) | `done` | JSON textarea with parse validation |
| BL-013 | Admin: Job-Criteria assignment UI | `done` | Tab 4 — toggle links per job title |

### Missing API Routes
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-014 | `PUT /api/jobs/[id]` and `DELETE /api/jobs/[id]` | `done` | Created `src/app/api/jobs/[id]/route.ts` |
| BL-015 | `GET /api/scenarios`, `POST /api/scenarios` | `done` | Created `src/app/api/scenarios/route.ts` |
| BL-016 | `PUT /api/scenarios/[id]`, `DELETE /api/scenarios/[id]` | `done` | Created `src/app/api/scenarios/[id]/route.ts` |
| BL-017 | `POST /api/jobs/[id]/criteria` and `DELETE /api/jobs/[id]/criteria/[criteriaId]` | `done` | Created `src/app/api/jobs/[id]/criteria/route.ts` |

### User Identity
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-018 | MVP user identity via localStorage username prompt | `done` | Modal on /simulate, saved to localStorage |
| BL-019 | Pre-session name capture modal on /simulate | `done` | Username passed as `userId` to POST /api/simulations |

---

## 🟡 Medium Priority

### UI / UX Gaps
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-020 | Add `error.tsx` global error boundary | `done` | `src/app/error.tsx` with retry + home links |
| BL-021 | Add `loading.tsx` for simulate and sessions routes | `done` | Skeleton loaders for both routes |
| BL-022 | Add `not-found.tsx` (404 page) | `done` | `src/app/not-found.tsx` |
| BL-023 | Session detail page `/sessions/[id]` | `done` | Full transcript + per-criteria score breakdown |
| BL-024 | Home page nav should link to expanded admin sections | `done` | Updated Sessions + Admin card descriptions |
| BL-025 | Sessions page: show score bar chart instead of grid | `done` | Horizontal bar chart in list + fixed score color thresholds in detail page |
| BL-026 | Error state when API is unavailable (Neon cold start) | `done` | simulate/page.tsx + sessions/page.tsx — retry button + error message |

### Phone Simulation
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-027 | Telnyx integration — outbound call initiation | `done` | `/api/telnyx/call` route; requires TELNYX_API_KEY + TELNYX_CONNECTION_ID + TELNYX_FROM_NUMBER in .env |
| BL-028 | Telnyx webhook handler (`/api/telnyx/webhook`) | `done` | Full call flow: answered → speak → gather → AI reply → loop; hangup closes session |
| BL-029 | Phone simulation UI — show transcript as call progresses | `done` | Phone call UI in `/simulate/[sessionId]` — dial screen, active call with live transcript polling (3s), hang-up button, call timer |

### AI Quality
| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-030 | Seed scenarios with realistic `script` JSON payloads | `done` | All 6 scenarios seeded via Neon MCP with personas + hints |
| BL-031 | End-of-conversation detection (AI signals end naturally) | `done` | [RESOLVED] token from AI → auto-end via SSE session_ending/session_ended |
| BL-032 | Scoring: attach justification text per criterion to session view | `done` | Feedback shown in session detail page |

---

## 🟢 Low Priority / Infrastructure

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| BL-033 | Create `src/types/index.ts` barrel file for shared types | `done` | Created with all shared types + SSE event payload types |
| BL-034 | Environment variable validation on startup | `done` | `src/lib/env.ts` — warns in dev, throws in prod for missing vars |
| BL-035 | `prisma/seed.ts` file for repeatable seed data | `done` | Full idempotent seed: 3 job titles, 7 criteria, 6 scenarios, job-criteria links |
| BL-036 | Switch from `prisma db push` to `prisma migrate dev` workflow | `done` | Baseline migration created + resolved; `prisma.config.ts` replaces deprecated `package.json#prisma` |
| BL-037 | `wrangler.toml` + `@cloudflare/next-on-pages` setup | `done` | `wrangler.toml` created; pages:build/preview/deploy scripts in package.json; `images.unoptimized` added to next.config.ts |
| BL-038 | GitHub Actions CI/CD workflow | `done` | `.github/workflows/ci.yml` — lint, typecheck, build jobs with dummy env vars |
| BL-039 | Add `edge` runtime to streaming API routes (for Cloudflare) | `done` | All 10 API routes + sessions/[id] page; Prisma updated to Neon HTTP adapter (`@prisma/adapter-neon`) |
| BL-040 | Authentication with NextAuth.js | `done` | `src/auth.ts` (GitHub + Credentials providers, JWT strategy); middleware; `/auth/signin` page; SessionProvider in layout; simulate page uses session userId |
| BL-041 | Analytics dashboard (score trends over time) | `done` | `/analytics` page + `/api/analytics` route; score trend chart, per-criteria heatmap, job/type breakdowns; linked from home page |
| BL-042 | Org/team model for multi-company SaaS | `done` | Phase 6 |
| BL-043 | Delete stale `src/index.ts` from filesystem | `done` | Confirmed not present on disk; tsconfig exclude kept as safeguard |
| BL-044 | `npm run lint` clean (ESLint passes with 0 errors) | `done` | Verified clean; 0 errors |

---

## Completed Items

| ID | Title | Completed |
|----|-------|-----------|
| ✅ | Next.js App Router scaffolding | Phase 1 |
| ✅ | Prisma schema (7 models, 3 enums) | Phase 1 |
| ✅ | Neon DB tables + seed data | Phase 1 |
| ✅ | API routes: jobs, criteria, criteria/[id], simulations, scoring | Phase 2 |
| ✅ | UI pages: home, simulate (selector), admin (criteria), sessions | Phase 2 |
| ✅ | `src/lib/ai.ts` Groq client with streaming + auto-scoring | Phase 3 |
| ✅ | `POST /api/chat` streaming SSE chat endpoint | Phase 3 |
| ✅ | `GET /api/chat` session loader | Phase 3 |
| ✅ | `/simulate/[sessionId]` active chat UI with SSE streaming | Phase 3 |
| ✅ | Simulate page wired to create session + redirect | Phase 3 |
| ✅ | Sessions page with score display + Resume link | Phase 3 |
| ✅ | Engineering docs (ENGINEERING.md) | Phase 3 |
| ✅ | Technology reference library (docs/tech/) | Phase 3 |
| ✅ | Roadmap + coherence review (ROADMAP.md) | Phase 3 |
| ✅ | `.env.example` | Phase 3 |
| ✅ | `groq-sdk` installed | Phase 3 |
| ✅ BL-010-013 | Admin expanded: 4 tabs (Criteria, Job Titles, Scenarios, Job↔Criteria) | Phase 3 |
| ✅ BL-014-017 | All missing CRUD API routes (jobs, scenarios, job-criteria) | Phase 3 |
| ✅ BL-018-019 | Username modal + localStorage identity | Phase 3 |
| ✅ BL-020-022 | error.tsx, loading.tsx (x2), not-found.tsx | Phase 3 |
| ✅ BL-023 | Session detail page `/sessions/[id]` with transcript | Phase 3 |
| ✅ BL-030 | 6 scenarios seeded with full personas, objectives, hints | Phase 3 |

| ✅ BL-024 | Home page card descriptions updated | Sprint 4 |
| ✅ BL-026 | Retry button + error messages on simulate/sessions pages | Sprint 4 |
| ✅ BL-031 | AI [RESOLVED] natural end detection + auto-end session | Sprint 4 |
| ✅ BL-033 | `src/types/index.ts` shared types barrel (+ SSE payloads) | Sprint 4 |
| ✅ BL-034 | `src/lib/env.ts` env var validation (warn dev / throw prod) | Sprint 4 |

| ✅ BL-025 | Sessions score bar chart + detail page threshold fix | Sprint 5 |
| ✅ BL-035 | `prisma/seed.ts` — 3 jobs, 7 criteria, 6 scenarios, links | Sprint 5 |
| ✅ BL-036 | Migration baseline + `prisma.config.ts` (no more deprecated `package.json#prisma`) | Sprint 5 |
| ✅ BL-039 | Edge runtime on all 10 API routes + Neon HTTP adapter (`@prisma/adapter-neon`) | Sprint 5 |
| ✅ BL-044 | `npm run lint` — clean pass, 0 errors | Sprint 5 |

---

## Next Sprint Candidates

1. **BL-037** — `wrangler.toml` + `@cloudflare/next-on-pages` deployment setup
2. **BL-038** — GitHub Actions CI/CD workflow (build + lint on push)
3. **BL-040** — Authentication with NextAuth.js (Phase 4)
4. **BL-041** — Analytics dashboard: score trends over time per user
5. **BL-027/028** — Telnyx voice simulation (Phase 4)

# XPElevator — Roadmap & Coherence Review

This document tracks the product roadmap, identifies gaps in the current plan, and defines what "done" looks like for each phase.

---

## Current State (as of Phase 2 complete)

| Area | Status | Notes |
|------|--------|-------|
| Architecture documented | ✅ Done | C4 diagrams in ARCHITECTURE.md |
| Next.js scaffolded | ✅ Done | App Router, TS, Tailwind v4 |
| Prisma schema | ✅ Done | 7 models, 3 enums |
| Neon DB tables | ✅ Done | Schema applied, seed data loaded |
| API routes | ✅ Done | jobs, criteria, simulations, scoring |
| Admin UI | ✅ Done | Criteria CRUD (full) |
| Simulate UI | ⚠️ Partial | Job + scenario selector; no active session UI |
| Sessions UI | ✅ Done | List view with scores |
| AI integration | ❌ Missing | Groq client not created |
| Chat simulation | ❌ Missing | No streaming chat API or UI |
| Phone simulation | ❌ Missing | Telnyx not integrated |
| Authentication | ❌ Missing | No user identity |
| Cloudflare deploy | ❌ Missing | No wrangler.toml, no CI/CD |
| Error/loading UI | ⚠️ Partial | Only basic loading states |

---

## Coherence & Cohesion Review

### Gap 1: No User Identity
**Problem**: `SimulationSession.userId` is nullable `String`. There is no authentication. All employees share one anonymous session pool — there is no way to know *who* completed a simulation.

**Impact**: High. The core value proposition is tracking *employee* performance over time.

**Fix**:
- Phase 4: Add NextAuth.js with a simple email/password or SSO provider
- Short term: Store username in `localStorage` and pass as `userId` on session create (acceptable MVP hack)

---

### Gap 2: Simulate page doesn't start a real session
**Problem**: The scenario card `onClick` calls `alert(...)` — a placeholder. Clicking a scenario does nothing real.

**Impact**: Critical — blocks all user-facing functionality.

**Fix**: On scenario select, POST to `/api/simulations`, then redirect to `/simulate/[sessionId]`.

---

### Gap 3: No active simulation UI
**Problem**: `/simulate/[sessionId]` does not exist. There is no page to host the actual conversation.

**Impact**: Critical — the core product experience is missing.

**Fix**: Build chat UI with Server-Sent Events (SSE) for streaming AI responses.

---

### Gap 4: JobCriteria join is invisible
**Problem**: The `job_criteria` table correctly models "which criteria apply to which job title", but the Admin UI only manages global `criteria`. There is no UI to assign criteria to job titles.

**Impact**: Medium. All sessions currently have no associated criteria for scoring. The scoring API would need to derive criteria from the job title.

**Fix**:
- Expose a "Job Criteria" tab in the Admin panel
- OR: For MVP, make ALL active criteria apply to ALL job titles (simpler, eliminates the join complexity)

---

### Gap 5: Scenario `script` JSONB has no defined shape
**Problem**: `Scenario.script` is `Json @default("{}")` in Prisma. No TypeScript type or runtime schema validates it. The AI needs to read the script to know the customer persona and situation.

**Impact**: Medium. The AI will produce generic interactions without a structured scenario script.

**Fix**: Define a `ScenarioScript` interface:
```ts
interface ScenarioScript {
  customerPersona: string;   // "Frustrated customer waiting 3 weeks for a refund"
  customerObjective: string; // "Get refund processed today"
  difficulty: 'easy' | 'medium' | 'hard';
  hints?: string[];           // Behavioral cues for the AI
  maxTurns?: number;          // End conversation after N exchanges
}
```

---

### Gap 6: Scoring is triggered externally, not automatically
**Problem**: The `/api/scoring` endpoint creates `Score` records, but there is no mechanism to call it. Who scores the session? When?

**Impact**: Medium. Scoring is the key output of the simulator.

**Fix**:
- **Auto-scoring**: After the conversation ends, call the AI with the full transcript + criteria list, ask it to score each criterion 1-10 with justification.
- **Human scoring**: Show a post-session scoring form to a supervisor.
- Recommended: Start with auto-scoring via AI (simpler UX, more scalable).

---

### Gap 7: No `.env.example`
**Problem**: Developers cloning the repo have no template for `.env`. The README mentions it but the file doesn't exist.

**Fix**: Create `.env.example` with all variable names and dummy values. ✅ (done alongside this ROADMAP)

---

### Gap 8: No loading/error states for failures
**Problem**: If an API call fails (network error, Neon cold start timeout), most UI pages silently stop loading with no error message.

**Fix**: Add `error` state to all `useEffect` data fetches and render an error card.

---

## Phase Roadmap

### Phase 3 — Core Interaction Loop (Current Priority)

**Goal**: A user can select a job title + scenario, have a real chat conversation with an AI virtual customer, and see their score.

**Tasks**:
- [ ] `src/lib/ai.ts` — Groq client wrapper with typed prompt functions
- [ ] `src/app/api/chat/route.ts` — POST message, GET SSE stream of AI response
- [ ] `src/app/simulate/[sessionId]/page.tsx` — Chat UI
- [ ] Update `src/app/simulate/page.tsx` — wire up scenario selection to create session + redirect
- [ ] Auto-scoring at conversation end via AI
- [ ] Short-term MVP: localStorage username as `userId`

**Definition of Done**: An employee can complete a full chat simulation, see their score, and find the session in the Sessions list.

---

### Phase 4 — Quality & Multi-mode

**Goal**: Improve experience, add phone simulation, refine scoring.

**Tasks**:
- [ ] Phone simulation via Telnyx (webhook handler, call flow)
- [ ] Scenario script management in Admin UI (edit `script` JSONB)
- [ ] Job-Criteria assignment UI in Admin Panel
- [ ] Real authentication (NextAuth.js)
- [ ] Per-session score breakdown (criteria-by-criteria view)
- [ ] Error/loading states across all pages

---

### Phase 5 — Deployment & Operations

**Goal**: App running in production on Cloudflare Pages/Workers.

**Tasks**:
- [ ] `wrangler.toml` configuration
- [ ] `@cloudflare/next-on-pages` adapter
- [ ] Edge runtime for streaming API routes (required for Workers)
- [ ] CI/CD via GitHub Actions (build → deploy on push to `main`)
- [ ] Environment variables set in Cloudflare dashboard
- [ ] Domain `xpelevator.com` → Cloudflare Pages custom domain
- [ ] Neon connection string uses pooler endpoint

---

### Phase 6 — Scale & Analytics

**Goal**: Multi-tenant, analytics dashboard, advanced AI features.

**Tasks**:
- [ ] Organization/team model (multi-company SaaS)
- [ ] Analytics dashboard (score trends, pass/fail rates by criteria)
- [ ] AI-generated coaching feedback after sessions
- [ ] Scenario authoring wizard
- [ ] API for external LMS integration

---

## Architecture Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Neon Postgres over Railway/Supabase | Branching support for safe schema iteration | 2025 |
| Groq over OpenAI | 10x faster inference, free tier, llama-3 quality | 2025 |
| Next.js App Router | Server components reduce JS bundle, co-locate API | 2025 |
| Cloudflare Pages over Vercel | Edge Workers needed for Telnyx webhook + Durable Objects for WebSockets | 2025 |
| SSE over WebSocket | Simpler server-side (stateless Next.js routes), one-way stream is sufficient for AI chat | 2025 |
| Skip authentication for MVP | Reduces scope; add NextAuth.js in Phase 4 | 2025 |

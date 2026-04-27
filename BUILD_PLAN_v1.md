# BUILD_PLAN_v1 — xpelevator

> **Product:** Milestone-based learning journeys with AI-guided progression and subscription billing.  
> **Tagline:** "Elevate your expertise via guided learning journeys"  
> **Target launch:** 2026-08-01  
> **Estimated effort:** 12 weeks  
> **LLM cost estimate:** $40–60 USD (12 slices × ~$3–5 per slice)

---

## Part 0: TL;DR

**What:** A subscription-based platform where learners progress through AI-guided journeys (education paths, skill certifications, personal development). Comprehensive, measurable, outcome-oriented.

**Who:** 6 personas
1. **Learner** — Individual pursuing skill development (pays $10–100/mo per journey)
2. **Instructor** — Expert publishing journeys (receives 70% revenue share)
3. **Curator** — Curation expert bundling journeys (earns referral commission)
4. **Guest** — Free preview before signup (unauthenticated)
5. **Coach** — Optional live mentor (added in later slice)
6. **Admin** — Marketplace moderation + compliance

**Key flows:**
- Guest → browse journeys → signup → enroll → start → milestone 1 → progress → complete → review → referral
- Instructor → publish journey → set milestones → configure AI prompts → monitor enrollments → earn payout
- Curator → subscribe to journeys → create bundle → share → earn commission

**12 slices (S-00 through S-11):**
- S-00: Foundations (health/Sentry/schema/CI)
- S-01: Identity & learner profiles
- S-02: Instructor onboarding & journey publishing
- S-03: Journey catalog & discovery search
- S-04: Enrollment & subscription billing (Stripe)
- S-05: Milestone tracking & AI progress guidance
- S-06: Reviews & learner outcomes
- S-07: Curator tools & journey bundling
- S-08: Instructor payouts & analytics
- S-09: Admin compliance & content moderation
- S-10: Live coaching (optional add-on)
- S-11: Mobile + PWA polish

**Timeline:** 12 weeks (MVP launch → iterative)  
**Architecture:** Cloudflare Workers + Hono + Neon + Drizzle + Stripe Connect

---

## Part 1: Product

### Personas

| Persona | Goal | Pain Point | Needs |
|---------|------|------------|-------|
| **Learner (Alex)** | Gain practical skills fast | Expensive/scattered courses | Structured, affordable, proven outcomes |
| **Instructor (Jordan)** | Build audience + earn | Low discoverability, high fees | Easy publishing, analytics, fair splits |
| **Curator (Pat)** | Become trusted guide | Discovery chaos | Bundle tools, affiliate tracking |
| **Guest (Casey)** | Explore benefits | No-commitment preview | Free browse, non-intrusive signup |
| **Coach (Robin)** | Supplement income | Hard to find students | Easy integration, scheduling |
| **Admin (Morgan)** | Ensure quality & safety | DMCA/TCPA violations | Takedown tools, audit logs |

### Key User Journeys

**Learner journey (happy path):**
```
Browse journeys (S-03)
  → "Python for Data Sci" ($49/mo)
  → Signup (S-01) + enroll (S-04)
  → Start journey
  → Milestone 1: "Set up environment" (hints from AI, S-05)
  → Complete → unlock Milestone 2
  → Finish journey → leave review (S-06)
  → Recommended next journey via curation bundle (S-07)
```

**Instructor journey:**
```
Signup (S-01) + Stripe Connect onboarding (S-02)
  → Publish journey (S-02)
    - Title, description, pricing
    - 5-10 milestones with AI prompt templates
    - Success metrics (completion %, avg rating)
  → Monitor enrollments (S-08)
  → Review learner feedback (S-06 visibility)
  → Receive payout (S-08)
  → See analytics dashboard (S-08)
```

**Curator journey:**
```
Subscribe to journeys manually (S-03)
  → Access curator tools (S-07)
  → Create bundle: "Transition to Tech" (3 journeys)
  → Set bundle pricing ($99 for all 3 instead of $150 separate)
  → Share bundle link → earn $25 per enrollment (S-07)
```

### Success Metrics

- **Learner:** Completion rate > 70%, time-to-milestone < 2 weeks
- **Instructor:** Enrollment growth > 10/month after first 2 months
- **Curator:** Click-through > 5%, conversion > 15%
- **Platform:** Churn < 10%/month, NPS > 40, 99.9% uptime

---

## Part 2: Stack

### Canonical

| Component | Choice | Why |
|-----------|--------|-----|
| **Runtime** | Cloudflare Workers only | Stateless, global, auto-scaling |
| **Router** | Hono v4 | Lightweight, type-safe, Workers-first |
| **Database** | Neon Postgres 16 | Branching for PR isolation, autoscaling |
| **ORM** | Drizzle | Type-safe SQL, migrations via drizzle-kit |
| **Auth** | JWT via Web Crypto API | Self-managed, no external auth service |
| **Payments** | Stripe Connect Express | Instructor payout splits |
| **Storage** | R2 (for journey media) | CDN-backed, cheap, 6-month retention |
| **Queues** | Cloudflare Queues | Email sends, payout processing, cron jobs |
| **LLM** | Anthropic Opus/Haiku + Grok + Groq | AI progress hints, journey creation UI |
| **Errors** | Sentry via @adrper79-dot/monitoring | Error tracking, on-call alerts |
| **Analytics** | PostHog + factory_events | Product metrics + finance audit trail |
| **Email** | Resend | Transactional (onboarding, milestones, payouts) |
| **Observability** | /health, /ready, /metrics | Uptime monitoring, load testing |
| **Build** | tsup (ESM only) | Fast, no CommonJS |
| **Test** | Vitest + @cloudflare/vitest-pool-workers | 90%+ coverage, CI gates |
| **CI/CD** | GitHub Actions | Deploy on main merge, staging on PR |

### Forbidden

- No `process.env` (use c.env binding)
- No `require()` (ESM only)
- No `Buffer` (use Uint8Array)
- No `from 'jsonwebtoken'` (Web Crypto)
- No `node:fs`, `node:path`, `node:crypto` (Cloudflare APIs)
- No `@ts-ignore`, `eslint-disable` (in production code)
- No `wrangler.toml` (use wrangler.jsonc)
- No raw `fetch` without try-catch + error logging

---

## Part 3: Architecture

### Domain Model

**8 entity groups:**

1. **Identity** — users, sessions, instructor_profiles
2. **Content** — journeys, milestones, journey_versions (versioning for iteration)
3. **Enrollment** — enrollments, enrollment_progress (learner state machine)
4. **Billing** — subscriptions, subscription_events (Stripe webhook ledger)
5. **Payouts** — instructor_payouts, payout_batches (Stripe Connect transfers)
6. **Curation** — curator_bundles, bundle_journeys (1:N)
7. **Reviews** — reviews, review_votes, learner_outcomes (completion certificates)
8. **Compliance** — dmca_takedowns, gdpr_deletion_requests, consent_logs, moderator_actions

**Key tables:**

```sql
-- users: { id, email, name, role (learner|instructor|curator|admin) }
-- instructor_profiles: { user_id, stripe_account_id, bio, payout_enabled }

-- journeys: { id, instructor_id, title, description, pricing, published_at, status }
-- milestones: { id, journey_id, ordinal (1-10), title, instructions, hint_prompt }
-- journey_versions: { id, journey_id, version_num, published_at } -- A/B testing

-- enrollments: { id, learner_id, journey_id, subscription_id, started_at, completed_at }
-- enrollment_progress: { id, enrollment_id, milestone_id, unlocked_at, completed_at, ai_hint_used }

-- subscriptions: { id, learner_id, stripe_subscription_id, status, current_period_end }
-- subscription_events: { id, subscription_id, type (created|payment_succeeded|cancel), event_id (from Stripe) }

-- instructor_payouts: { id, instructor_id, batch_id, amount_usd, stripe_transfer_id, status }
-- payout_batches: { id, created_at, total_usd, status (pending|processing|completed) }

-- curator_bundles: { id, curator_id, title, description, price, commission_pct }
-- bundle_journeys: { id, bundle_id, journey_id, ordinal }

-- reviews: { id, learner_id, journey_id, rating (1-5), text, helpful_count }
-- learner_outcomes: { id, learner_id, journey_id, certificate_url, completed_at }

-- dmca_takedowns: { id, journey_id, status, filed_at, resolution_at }
-- gdpr_deletion_requests: { id, user_id, not_before, completed_at }
-- consent_logs: { id, user_id, version, accepted_at, ip_hashed }
-- moderator_actions: { id, moderator_id, target_type, target_id, action, reason }
```

### State Machines

**Journey publishing:**
```
DRAFT → IN_REVIEW (moderator checks) → PUBLISHED | REJECTED
          ↓
      If rejected → DRAFT (edit & resubmit)
```

**Enrollment progression:**
```
STARTED
  → MILESTONE_1_UNLOCKED
     → (learner works)
     → MILESTONE_1_COMPLETED
  → MILESTONE_2_UNLOCKED
     → ...
  → COMPLETED (all milestones done)
     → REVIEWED (if learner leaves review)
     → COMPLETED (final state)

Alternative: SUSPENDED (if subscription lapses), ABANDONED (after 60 days inactivity)
```

**Subscription billing:**
```
customer creates subscription (via Stripe Checkout)
  → subscription.created webhook
  → store in subscriptions table
  ↓
each billing cycle:
  payment_intent.succeeded webhook
    → update subscription (current_period_end)
    → learner keeps access
    ↓
    customer cancels:
      customer.subscription.deleted webhook
        → mark subscription.status = canceled
        → learner loses access to new journeys (completes in-progress ones)
```

### API Standards

**Request envelope:**
```json
{
  "method": "GET|POST|PATCH|DELETE",
  "path": "/api/v1/...",
  "headers": {
    "Authorization": "Bearer {jwt_token}",
    "Content-Type": "application/json"
  },
  "body": { /* endpoint-specific */ }
}
```

**Response envelope (success):**
```json
{
  "data": { /* resource(s) */ },
  "error": null,
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-04-27T19:00:00Z",
    "rate_limit": { "remaining": 99, "reset_at": "2026-04-27T19:05:00Z" }
  }
}
```

**Response envelope (error):**
```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED|VALIDATION_ERROR|NOT_FOUND|INTERNAL_ERROR",
    "message": "Human-readable explanation",
    "details": { /* field-level errors for VALIDATION_ERROR */ }
  },
  "meta": { "request_id": "uuid" }
}
```

### Queues

| Queue | Message | DLQ | Purpose |
|-------|---------|-----|---------|
| `enrollment-started` | `{"learner_id", "journey_id"}` | `enrollment-started-dlq` | Send "welcome" email from instructor, trigger AI hint generation |
| `milestone-completed` | `{"enrollment_id", "milestone_id"}` | `milestone-completed-dlq` | Send milestone-complete email, unlock next milestone |
| `payout-ready` | `{"batch_id", "total_usd"}` | `payout-ready-dlq` | Batch payout transfers to instructors via Stripe Connect |
| `review-posted` | `{"review_id", "journey_id"}` | `review-posted-dlq` | Update journey rating cache, notify instructor |
| `compliance-action` | `{"takedown_id\|gdpr_request_id", "user_id"}` | `compliance-action-dlq` | Async deletion, archive, or takedown processing |

---

## Part 4: Observability

### Endpoints

**`GET /health`**
- Returns: `{ status, worker, env, version, commit, uptime_s }`
- Used by CI: curl → 200 = deploy successful

**`GET /ready`**
- Probes:
  - Neon SELECT 1 (< 500ms)
  - KV getMetadata (< 500ms)
  - Queue producer connectivity
- Returns: 200 if all pass, 503 with failed probe details

**`GET /metrics`** (gated by METRICS_TOKEN)
- Prometheus format
- Counters: requests, errors, enrollments, payouts
- Histograms: request latency, DB query latency

### Sentry

- **DSN**: `env.SENTRY_DSN`
- **Tags**: `worker=xpelevator`, `env=(staging|prod)`, `release=<git-sha>`
- **Sample rate**: 1.0 staging, 0.25 production
- **Alert thresholds**:
  - Error rate > 1% over 5m → Discord
  - p95 latency > 1.5s over 10m → Discord
  - Stripe webhook failures > 0 over 1m → PagerDuty
  - Payout processing errors > 0 → PagerDuty

### PostHog

- **Project key**: `env.POSTHOG_KEY`
- **Event naming**: `{domain}.{action}` (e.g., `enrollment.started`, `journey.published`, `payout.completed`)
- **Funnels**:
  - Browse → Signup → Enroll → Start → Milestone 1 Completed
  - Publish →Enroll → Complete → Payout
- **Retention**: Weekly cohorts (learners still enrolled > 1 week)

### factory_events (audit ledger)

Append-only Neon table for finance/compliance reconciliation:
- All `auth.*` events (signup, login, logout)
- All `subscription.*` events (created, payment_succeeded, canceled)
- All `payout.*` events (calculated, transferred, failed)
- All `dmca.*` and `gdpr.*` events
- All `moderator.*` actions

---

## Part 5: Security & Compliance

### Auth

- **JWT via Web Crypto API** — no external auth service
- **Access token**: 15 min expiry
- **Refresh token**: 30 days, single-use (family-based revocation)
- **Scopes**: `learner`, `instructor`, `curator`, `admin` (per role)

### Rate Limiting

- **Per-user API rate limit**: 1000 requests/hour (Cloudflare DDoS Protection)
- **Auth rate limit**: 5 failed attempts → 15 min lockout
- **Stripe webhook rate limit**: No limit (trusted source)

### Stripe webhook security

- Every webhook normalized to `stripe_events` table with `(event_id, processed_at)` unique constraint
- Idempotency key used on all Stripe API calls
- If duplicate `event_id` received, ignore (don't double-process)

### Compliance

| Requirement | Scope | Implementation |
|-------------|-------|-----------------|
| **GDPR** | EU learners | Export endpoint (/me/export), 30-day deletion grace, consent logs |
| **CCPA** | CA/US learners | Same as GDPR; applies if any EU/CA/US user |
| **COPPA** | US learners < 13 | Platform is 18+, no children allowed, auto-delete on report |
| **DMCA** | Takedowns | Intake form, 5 business day triage, counter-notice, repeat-infringer disabled after 3 |
| **TCPA** | US phone/SMS | Opt-in consent required; Coach calling is opt-in only |

### Data classification

| Class | Examples | Storage | Encryption |
|-------|----------|---------|------------|
| **Public** | Journey listings, instructor display names | Neon, cache | TLS in transit |
| **User-private** | Email, phone, progress | Neon | TLS + at-rest |
| **Sensitive** | Stripe Connect account, coaching notes | Via Stripe / external service | Never stored locally |
| **Audit** | `factory_events`, webhook payloads | Neon append-only | TLS + at-rest |
| **Evidence** | DMCA notices, GDPR requests | R2 immutable bucket | TLS + at-rest |

---

## Part 6: DR & Cost & Reliability

### RTO / RPO

- **RTO** (recovery time objective): **1 hour** (Neon PITR restore to new branch, swap binding)
- **RPO** (recovery point objective): **24 hours** worst case (Neon PITR; weekly logical backups to R2 for extra safety)
- **Availability SLO**: 99.9% rolling 30 days (43 min/month error budget)

### Backup strategy

**Neon PITR:**
- **Staging**: 7 days
- **Production**: 30 days
- Restore: Create new branch from point-in-time, test, swap Hyperdrive binding

**R2 cold-storage:**
- Weekly logical dump (pg_dump) → R2 bucket `xpelevator-backups-cold`
- Retention: 90 days
- Lambda: Not used; weekly cron Worker triggers dump

### LLM cost guard

- **Orchestrator** hardcodes max spend per run (--budget-usd, default $5)
- **Monthly cap** (ANTHROPIC_MONTHLY_BUDGET_USD, default $300)
- Nightly cron tallies spend; if exceeded → hard stop + GitHub issue

### Failure-mode matrix

| Failure | Detection | Mitigation | Recovery |
|---------|-----------|-----------|----------|
| Neon outage | /ready 503 | Read-only banner; cached browse | Auto when Neon recovers |
| Stripe API down | Webhook backlog | Queue messages retry × 3 with exponential backoff | Manual webhook replay |
| Payout processing stuck | Batch status still "processing" after 24h | Re-run batch; Stripe retry | Manual inspection |
| LLM rate limit hit | Anthropic API 429 | Fallback chain (Grok → Groq) | Auto with fallback |
| R2 region failure | Upload 503 | Queue retry; log alert | Auto CF recovery |

### Cost model (monthly, MVP scale)

| Component | Estimate | Notes |
|-----------|----------|-------|
| **Cloudflare Workers** | $10–50 | Request-based; under 100k req/day = free |
| **Neon** | $0–50 | Free tier up to 1GB; then $10/100GB |
| **R2** | $5–10 | Cheap storage; 1M PUT/PATCH = $6 |
| **Sentry** | Free (hobby) | 10 events/min free tier |
| **PostHog** | Free (hobby) | 1M events/month free |
| **Anthropic** | $20–100 | AI hints + curriculum generation (variable) |
| **Stripe** | 2.9% + $0.30/transaction | Revenue-based |
| **Resend** | $5–20 | Email volume-based |
| **Total** | **$40–200** | Excluding Stripe/Anthropic variability & revenue |

---

## Part 7: Build Order (12 Slices)

Slices are independently deployable; order respects dependencies.

| Slice | Name | Features | Dependencies | Deploy gate |
|-------|------|----------|--------------|-------------|
| **S-00** | Foundations | /health, Sentry, Drizzle schema, CI gates | None | curl /health → 200 |
| **S-01** | Identity | Register, login, profiles, JWT families | S-00 | E2E signup → login → /me |
| **S-02** | Instructor onboarding | Stripe Connect flow, profile setup | S-01 | Test host onboards in staging |
| **S-03** | Journey catalog | CRUD journeys, publish flow, search (FTS) | S-02 | Browse + search > 1k journeys, p95 < 600ms |
| **S-04** | Enrollment & billing | Stripe Checkout, subscription state machine | S-03 | E2E real test enrollment + webhook |
| **S-05** | Milestone tracking | Progress tracking, AI hint generation | S-04 | Learner completes milestone → hint shown |
| **S-06** | Reviews & outcomes | Ratings, certificates, learner feedback | S-05 | Learner completes journey → review posts |
| **S-07** | Curator tools | Bundle creation, affiliate link sharing | S-03 | Curator creates bundle → tracks clicks |
| **S-08** | Instructor payouts | Analytics dashboard, monthly payouts | S-05 + S-02 | Instructor receives test transfer |
| **S-09** | Admin compliance | DMCA intake, GDPR delete, moderator console | S-01 + S-03 | Submit takedown → content hidden < 24h |
| **S-10** | Live coaching (optional) | Booking, video call scheduling, SLA tracking | S-04 | E2E book coach + receive Zoom link |
| **S-11** | PWA polish | Offline shell, installable, a11y audit | S-06 | Lighthouse PWA + a11y ≥ 95 |

---

## Part 8: Feature Registry

→ See `registry/features.yaml` for detailed feature breakdown (9 seed features F-001–F-005, F-010–F-012, F-100).

---

## Part 9: Orchestrator Hardening

10 improvements over legacy orchestrator:
1. ✅ LLM fallback chain (Anthropic → Grok → Groq)
2. ✅ Persisted briefs (briefs/F-XXX.json) for replay
3. ✅ Signed reviews (sha256, briefs/F-XXX.review.json)
4. ✅ Restricted-paths refusal (auth/, payments/, webhooks/, dmca/)
5. ✅ Clarification protocol (needs_clarification routes back to architect)
6. ✅ Budget guard (hard stop at --budget-usd)
7. ✅ CLI flags (--plan, --dry-run, --rebrief, --feature, --slice, --budget-usd)
8. ✅ Writes only to output/, never to src/
9. ✅ Deterministic execution (temperature, seed)
10. ✅ Comprehensive logging (JSON JSONL run.log)

---

## Part 10: Quality Gates

All must pass before merge:

- ✅ **TypeScript strict**: `npm run typecheck` → 0 errors
- ✅ **ESLint**: `npm run lint` → 0 warnings (`--max-warnings 0`)
- ✅ **Tests**: `npm test` → 90% line, 90% function, 85% branch coverage
- ✅ **Build**: `tsup` → dist/ with no errors
- ✅ **JSDoc**: 90%+ of exported symbols documented
- ✅ **Health check**: `curl staging/health` → 200
- ✅ **Forbidden APIs**: `npm run check:forbidden` → passes
- ✅ **CI/CD**: GitHub Actions all green

---

## Part 11: Commit & PR & Branch

**Branch**: `plan/v1-world-class`

**Commit** (1 atomic commit):
```
plan(s00): world-class v1 launch

Archive legacy docs (if any), add:
- BUILD_PLAN_v1.md (canonical 13-part plan, 12 slices)
- build_context.md (LLM agent context, 8 domain tables)
- registry/features.yaml (9 seed features)
- registry/schema.json (JSON Schema 2020-12)
- scripts/registry-validate.mjs (Ajv + structural rules)
- scripts/orchestrator-v2.mjs (LLM fallback chain)
- scripts/check-forbidden-apis.mjs
- docs/runbooks/* (observability, DR, compliance, orchestrator-contract)
- .github/workflows/registry.yml
- briefs/README.md (artifact lifecycle)
- EXECUTION_READINESS.md
- SYNTHETIC_ORCHESTRATOR_WALKTHROUGH.js
- Update package.json: add yaml, ajv, ajv-formats + scripts

Direction: xpelevator = milestone-based learning journeys with AI-guided progression and Stripe Connect payouts.
```

**PR**: `plan/v1-world-class` → `main`
- Title: "Plan v1 - world-class launch"
- Body: Comprehensive delivery summary (see FINAL_DELIVERY.md template)

---

## Part 12: Open Decisions (D-001 through D-007)

| ID | Question | Current status | Resolution date |
|----|-----------|----|--|
| **D-001** | Coaching (S-10): sync (1:1 calls) or async (video messages)? | Async preferred for scale; sync optional premium | Week 4 |
| **D-002** | Journey versioning: allow A/B testing or linear versioning only? | Linear versioning (simpler); A/B testing in Phase 2 | Week 2 |
| **D-003** | Certification: on-platform certificate or integrate with Credly? | On-platform v1; Credly integration Phase 2 | Week 3 |
| **D-004** | Pricing tiers: per-journey (variable) or flat subscription (fixed)? | Per-journey; instructors set price, xpelevator takes 30% | Week 1 |
| **D-005** | Learner abandonment: what's the policy after 60 days inactivity? | Suspend enrollment, allow resume within 6mo | Week 5 |
| **D-006** | Curator commission: flat % or tiered by volume? | Flat 25% per enrollment; tiered Phase 2 | Week 2 |
| **D-007** | Data residency: EU learners' data stay in EU Neon region? | Yes; Neon branch per region; Hyperdrive per region | Phase 6 infra |

---

## Part 13: Links & References

**Plan documentation:**
- [EXECUTION_READINESS.md](#) — Comprehensive readiness proof
- [SYNTHETIC_ORCHESTRATOR_WALKTHROUGH.js](#) — F-001 walkthrough with artifacts
- [registry/features.yaml](#) — Feature registry (9 seeds)
- [docs/APP_PLANNING_PATTERN.md](#) — Reusable pattern for other apps

**Operational:**
- [docs/runbooks/observability.md](#) — Sentry/PostHog/factory_events setup
- [docs/runbooks/dr-and-cost.md](#) — Backup/restore, LLM budget guard
- [docs/runbooks/compliance.md](#) — GDPR/DMCA/TCPA/COPPA/TCPA
- [docs/runbooks/orchestrator-contract.md](#) — Full orchestrator interface

**Factory infrastructure:**
- [@adrper79-dot/auth](#) — JWT + RBAC
- [@adrper79-dot/stripe](#) — Stripe Connect integration
- [@adrper79-dot/llm](#) — LLM fallback chain
- [Cloudflare Queues](#) — Message queuing
- [Neon Postgres](#) — Database + PITR

---

**Status**: ✅ **READY TO EXECUTE**  
**Next step**: Merge PR, set credentials (PACKAGES_READ_TOKEN + ANTHROPIC_API_KEY), run orchestrator on S-00.

# XPElevator Architecture

## Overview
XPElevator is a **virtual customer simulator** for training employees on customer interactions. Users select a job title, which triggers training scenarios (phone calls and chat) with simulated customers, scored against updatable criteria.

## Tech Stack
- **Frontend**: Next.js on Cloudflare Pages
- **Backend**: Cloudflare Workers (API routes via Next.js)
- **Database**: Neon Postgres (serverless) with Prisma ORM
- **Voice**: Telnyx (inbound/outbound calls, TTS/STT)
- **AI**: Groq/Grok for dynamic customer responses
- **Auth**: Cloudflare Access

## C4 Context Diagram

```
┌─────────────────────────────────┐
│         XPElevator App          │
│   (Next.js on Cloudflare Pages) │
└────────┬──────┬──────┬──────────┘
         │      │      │
    ┌────▼──┐ ┌─▼────┐ ┌▼─────────┐
    │ Neon  │ │Telnyx│ │ Groq/Grok│
    │  DB   │ │Voice │ │   LLM    │
    └───────┘ └──────┘ └──────────┘
```

## C4 Container Diagram

```
┌───────────────────────────────────────────────────┐
│                  Cloudflare Edge                   │
│                                                    │
│  ┌──────────────┐   ┌──────────────────────────┐  │
│  │  Next.js UI  │   │  API Routes (Workers)    │  │
│  │  - Job Select│   │  - /api/jobs             │  │
│  │  - Chat View │   │  - /api/simulations      │  │
│  │  - Scoring   │   │  - /api/criteria         │  │
│  │  - Admin     │   │  - /api/scoring          │  │
│  └──────┬───────┘   │  - /api/telnyx/webhook   │  │
│         │           └────┬─────────┬───────────┘  │
│         │                │         │               │
└─────────┼────────────────┼─────────┼───────────────┘
          │                │         │
   ┌──────▼────────────────▼──┐  ┌───▼──────┐
   │      Neon Postgres       │  │  Telnyx  │
   │  - job_titles            │  │  Voice   │
   │  - scenarios             │  │  API     │
   │  - criteria              │  └──────────┘
   │  - simulation_sessions   │
   │  - scores                │
   │  - chat_messages         │
   └──────────────────────────┘
```

## Database Schema

### Tables
- **job_titles**: id, name, description, created_at
- **scenarios**: id, job_title_id (FK), name, description, type (phone/chat), script (JSONB), created_at
- **criteria**: id, name, description, weight (1-10), category, active, created_at, updated_at
- **job_criteria**: id, job_title_id (FK), criteria_id (FK) — links criteria to jobs
- **simulation_sessions**: id, user_id, job_title_id (FK), scenario_id (FK), type, status, started_at, ended_at
- **chat_messages**: id, session_id (FK), role (customer/agent), content, timestamp
- **scores**: id, session_id (FK), criteria_id (FK), score (numeric), feedback, scored_at

## Key Flows
1. **Job Selection → Menu**: User picks job title → fetches linked scenarios → shows phone/chat options
2. **Chat Simulation**: WebSocket chat with AI-driven virtual customer, messages logged to DB
3. **Phone Simulation**: Telnyx call triggered, TTS reads customer script, STT transcribes agent responses
4. **Scoring**: After session ends, evaluate against criteria (auto + manual), store scores
5. **Admin Criteria**: Non-technical admins update criteria via CRUD interface, changes apply immediately

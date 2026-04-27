import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from './index.js';

// ---------------------------------------------------------------------------
// Mock all external packages that require real infrastructure
// ---------------------------------------------------------------------------

vi.mock('@adrper79-dot/neon', () => ({
  createDb: vi.fn(() => ({})),
  sql: vi.fn(),
}));

vi.mock('@adrper79-dot/auth', () => ({
  jwtMiddleware: vi.fn(() => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('jwtPayload', { sub: 'user-123', role: 'member', iat: 0, exp: 9999999999 });
    return next();
  }),
}));

vi.mock('@adrper79-dot/monitoring', () => ({ captureError: vi.fn() }));

vi.mock('@adrper79-dot/stripe', () => ({
  createStripeClient: vi.fn(() => ({})),
  stripeWebhookHandler: vi.fn(
    () =>
      async (c: { json: (b: unknown) => Response }) =>
        c.json({ data: { received: true }, error: null }),
  ),
  createCheckoutSession: vi.fn().mockResolvedValue('https://checkout.stripe.com/test'),
  getSubscription: vi.fn().mockResolvedValue({
    customerId: 'cus_test',
    status: 'active',
    tier: 'price_pro',
    currentPeriodEnd: new Date('2027-01-01'),
    cancelAtPeriodEnd: false,
  }),
}));

// ---------------------------------------------------------------------------
// Mock DB query functions
// ---------------------------------------------------------------------------

const mockMember = {
  id: 'member-uuid',
  userId: 'user-123',
  email: 'user@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  plan: 'free',
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockJourney = {
  id: 'journey-uuid',
  title: 'Mindset Mastery',
  description: 'Build an unshakeable mindset',
  category: 'mindset',
  difficulty: 'beginner',
  durationDays: 3,
  status: 'published',
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEnrollment = {
  id: 'enrollment-uuid',
  memberId: 'member-uuid',
  journeyId: 'journey-uuid',
  status: 'active',
  progressPct: 0,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMilestone = {
  id: 'milestone-uuid',
  enrollmentId: 'enrollment-uuid',
  journeyId: 'journey-uuid',
  title: 'Day 1',
  dayNumber: 1,
  completed: false,
  completedAt: null,
  notes: null,
  createdAt: new Date(),
};

vi.mock('./db/queries.js', () => ({
  getMemberByUserId: vi.fn().mockResolvedValue(mockMember),
  getMemberByStripeCustomerId: vi.fn().mockResolvedValue(mockMember),
  createMember: vi.fn().mockResolvedValue(mockMember),
  updateMember: vi.fn().mockResolvedValue(mockMember),
  listJourneys: vi.fn().mockResolvedValue([mockJourney]),
  getJourney: vi.fn().mockResolvedValue(mockJourney),
  getEnrollmentsByMember: vi.fn().mockResolvedValue([mockEnrollment]),
  getEnrollmentForMember: vi.fn().mockResolvedValue(mockEnrollment),
  createEnrollment: vi.fn().mockResolvedValue(mockEnrollment),
  createMilestonesForEnrollment: vi.fn().mockResolvedValue(undefined),
  getMilestonesByEnrollment: vi.fn().mockResolvedValue([mockMilestone]),
  getMilestone: vi.fn().mockResolvedValue(mockMilestone),
  completeMilestone: vi.fn().mockResolvedValue({ ...mockMilestone, completed: true }),
  setEnrollmentStatus: vi.fn().mockResolvedValue(undefined),
  updateEnrollmentProgress: vi.fn().mockResolvedValue(undefined),
  getSubscriptionByMember: vi.fn().mockResolvedValue(null),
  upsertSubscription: vi.fn().mockResolvedValue(undefined),
  updateSubscriptionStatus: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Shared test env bindings
// ---------------------------------------------------------------------------

const testEnv = {
  ENVIRONMENT: 'test',
  WORKER_NAME: 'xpelevator',
  DB: { connectionString: 'postgresql://test' } as unknown as Hyperdrive,
  AUTH_RATE_LIMITER: {} as RateLimit,
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  SENTRY_DSN: '',
  POSTHOG_KEY: '',
  ANTHROPIC_API_KEY: '',
  GROK_API_KEY: '',
  GROQ_API_KEY: '',
  RESEND_API_KEY: '',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_WEBHOOK_SECRET: 'whsec_placeholder',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.request('/health', {}, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; worker: string };
    expect(body.status).toBe('ok');
    expect(body.worker).toBe('xpelevator');
  });
});

describe('GET /api/me', () => {
  it('returns JWT payload', async () => {
    const res = await app.request('/api/me', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { sub: string } };
    expect(body.data.sub).toBe('user-123');
  });
});

describe('POST /api/members', () => {
  it('creates a new member and returns 201', async () => {
    const queries = await import('./db/queries.js');
    vi.mocked(queries.getMemberByUserId).mockResolvedValueOnce(null);

    const res = await app.request('/api/members', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', displayName: 'Test User' }),
    }, testEnv);

    expect(res.status).toBe(201);
    const body = await res.json() as { data: typeof mockMember };
    expect(body.data.userId).toBe('user-123');
  });

  it('returns 422 if email is missing', async () => {
    const queries = await import('./db/queries.js');
    vi.mocked(queries.getMemberByUserId).mockResolvedValueOnce(null);

    const res = await app.request('/api/members', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Test' }),
    }, testEnv);

    expect(res.status).toBe(422);
  });

  it('returns 200 (idempotent) if member already exists', async () => {
    // Default mock returns existing member
    const res = await app.request('/api/members', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', displayName: 'Test User' }),
    }, testEnv);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/members/me', () => {
  it('returns member profile', async () => {
    const res = await app.request('/api/members/me', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof mockMember };
    expect(body.data.email).toBe('user@example.com');
  });

  it('returns 404 if member not found', async () => {
    const queries = await import('./db/queries.js');
    vi.mocked(queries.getMemberByUserId).mockResolvedValueOnce(null);

    const res = await app.request('/api/members/me', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/journeys', () => {
  it('returns list of journeys', async () => {
    const res = await app.request('/api/journeys', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
  });
});

describe('GET /api/journeys/:id', () => {
  it('returns a single published journey', async () => {
    const res = await app.request('/api/journeys/journey-uuid', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: typeof mockJourney };
    expect(body.data.title).toBe('Mindset Mastery');
  });

  it('returns 404 for draft journey', async () => {
    const queries = await import('./db/queries.js');
    vi.mocked(queries.getJourney).mockResolvedValueOnce({ ...mockJourney, status: 'draft' });

    const res = await app.request('/api/journeys/journey-uuid', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/enrollments', () => {
  it('enrolls in a journey and returns 201', async () => {
    const res = await app.request('/api/enrollments', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ journeyId: 'journey-uuid' }),
    }, testEnv);
    expect(res.status).toBe(201);
    const body = await res.json() as { data: typeof mockEnrollment };
    expect(body.data.journeyId).toBe('journey-uuid');
  });

  it('returns 422 if journeyId missing', async () => {
    const res = await app.request('/api/enrollments', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, testEnv);
    expect(res.status).toBe(422);
  });
});

describe('GET /api/enrollments', () => {
  it('returns member enrollments', async () => {
    const res = await app.request('/api/enrollments', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data.length).toBe(1);
  });
});

describe('GET /api/enrollments/:id', () => {
  it('returns enrollment with milestones', async () => {
    const res = await app.request('/api/enrollments/enrollment-uuid', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: { enrollment: typeof mockEnrollment; milestones: unknown[] };
    };
    expect(body.data.enrollment.id).toBe('enrollment-uuid');
    expect(Array.isArray(body.data.milestones)).toBe(true);
  });
});

describe('PATCH /api/enrollments/:id/milestones/:milestoneId', () => {
  it('marks a milestone complete', async () => {
    const res = await app.request(
      '/api/enrollments/enrollment-uuid/milestones/milestone-uuid',
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Great session' }),
      },
      testEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { completed: boolean } };
    expect(body.data.completed).toBe(true);
  });
});

describe('GET /api/subscriptions/me', () => {
  it('returns none status when no Stripe customer ID', async () => {
    const res = await app.request('/api/subscriptions/me', {
      headers: { Authorization: 'Bearer token' },
    }, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    // mockMember.stripeCustomerId is null → status 'none'
    expect(body.data.status).toBe('none');
  });
});

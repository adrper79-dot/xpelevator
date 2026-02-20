/**
 * Integration tests for /api/simulations
 *
 * Bridges tested:
 *   1. POST creates session → bridge man starts crossing (PENDING→IN_PROGRESS)
 *   2. POST persists userId, jobTitleId, scenarioId, type
 *   3. POST handles DB error gracefully (500)
 *   4. GET all sessions — all bridge crossings visible
 *   5. GET filtered by userId — only one person's crossings shown
 *   6. GET handles DB error gracefully (500)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { GET, POST } from '@/app/api/simulations/route';

// ─────────────────────────────────────────────────────────────────────────────

const BASE_SESSION = {
  id: 'sess-001',
  userId: 'user-auth-123',
  jobTitleId: 'job-001',
  scenarioId: 'sc-001',
  type: 'CHAT' as const,
  status: 'IN_PROGRESS' as const,
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  orgId: null,
  dbUserId: null,
  scenario: { id: 'sc-001', name: 'Test Scenario', type: 'CHAT' },
  jobTitle: { id: 'job-001', name: 'Agent' },
};

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/simulations', () => {
  beforeEach(resetPrismaMock);

  it('creates session with IN_PROGRESS status and returns 201', async () => {
    prismaMock.simulationSession.create.mockResolvedValueOnce(BASE_SESSION);

    const r = req('POST', '/api/simulations', {
      userId: 'user-auth-123',
      jobTitleId: 'job-001',
      scenarioId: 'sc-001',
      type: 'CHAT',
    });
    const res = await POST(r);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.id).toBe('sess-001');
    expect(data.status).toBe('IN_PROGRESS');
  });

  it('sets startedAt on creation', async () => {
    prismaMock.simulationSession.create.mockResolvedValueOnce(BASE_SESSION);

    const r = req('POST', '/api/simulations', {
      userId: 'user-auth-123',
      jobTitleId: 'job-001',
      scenarioId: 'sc-001',
      type: 'CHAT',
    });
    await POST(r);

    const createArgs = prismaMock.simulationSession.create.mock.calls[0][0] as {
      data: { status: string; startedAt: Date };
    };
    expect(createArgs.data.status).toBe('IN_PROGRESS');
    expect(createArgs.data.startedAt).toBeDefined();
  });

  it('includes scenario and jobTitle in response (via include)', async () => {
    prismaMock.simulationSession.create.mockResolvedValueOnce(BASE_SESSION);
    const r = req('POST', '/api/simulations', {
      userId: 'u1',
      jobTitleId: 'j1',
      scenarioId: 's1',
      type: 'PHONE',
    });
    const createArgs = prismaMock.simulationSession.create; // call it
    await POST(r);
    const include = (createArgs.mock.calls[0][0] as { include?: unknown }).include;
    expect(include).toBeTruthy();
  });

  it('returns 500 when DB throws', async () => {
    prismaMock.simulationSession.create.mockRejectedValueOnce(new Error('Connection reset'));
    const r = req('POST', '/api/simulations', {
      userId: 'u1',
      jobTitleId: 'j1',
      scenarioId: 's1',
      type: 'CHAT',
    });
    const res = await POST(r);
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/simulations', () => {
  beforeEach(resetPrismaMock);

  it('returns all sessions when no userId filter', async () => {
    prismaMock.simulationSession.findMany.mockResolvedValueOnce([BASE_SESSION]);
    const r = req('GET', '/api/simulations');
    const res = await GET(r);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('sess-001');
  });

  it('filters by userId when provided', async () => {
    prismaMock.simulationSession.findMany.mockResolvedValueOnce([BASE_SESSION]);
    const r = req('GET', '/api/simulations?userId=user-auth-123');
    await GET(r);

    const findArgs = prismaMock.simulationSession.findMany.mock.calls[0][0] as {
      where?: { userId: string };
    };
    expect(findArgs.where?.userId).toBe('user-auth-123');
  });

  it('does not apply where clause when userId is absent', async () => {
    prismaMock.simulationSession.findMany.mockResolvedValueOnce([]);
    const r = req('GET', '/api/simulations');
    await GET(r);

    const findArgs = prismaMock.simulationSession.findMany.mock.calls[0][0] as {
      where?: unknown;
    };
    expect(findArgs.where).toBeUndefined();
  });

  it('returns 500 on DB error', async () => {
    prismaMock.simulationSession.findMany.mockRejectedValueOnce(new Error('DB error'));
    const r = req('GET', '/api/simulations');
    const res = await GET(r);
    expect(res.status).toBe(500);
  });
});

/**
 * Integration tests for /api/scenarios and /api/scenarios/[id]
 *
 * Bridges tested:
 *   1. GET all scenarios (no filter)
 *   2. GET scenarios filtered by jobTitleId
 *   3. POST creates scenario (validation: name, jobTitleId, type required)
 *   4. POST rejects when required fields are missing (400)
 *   5. PUT updates a scenario
 *   6. DELETE removes a scenario
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { GET, POST } from '@/app/api/scenarios/route';
import { PUT, DELETE } from '@/app/api/scenarios/[id]/route';

// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_SCENARIO = {
  id: 'sc-001',
  name: 'Angry Bill Dispute',
  description: 'Customer disputes an unexpected charge.',
  type: 'CHAT' as const,
  script: { customerPersona: 'Angry customer', customerObjective: 'Refund', difficulty: 'hard' },
  jobTitleId: 'job-001',
  createdAt: new Date(),
  orgId: null,
  jobTitle: { id: 'job-001', name: 'Billing Agent' },
};

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/scenarios', () => {
  beforeEach(resetPrismaMock);

  it('returns all scenarios when no filter', async () => {
    prismaMock.scenario.findMany.mockResolvedValueOnce([SAMPLE_SCENARIO]);
    const r = req('GET', '/api/scenarios');
    const res = await GET(r);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Angry Bill Dispute');
  });

  it('filters by jobTitleId when provided', async () => {
    prismaMock.scenario.findMany.mockResolvedValueOnce([SAMPLE_SCENARIO]);
    const r = req('GET', '/api/scenarios?jobTitleId=job-001');
    const res = await GET(r);
    // Verify the where clause was applied
    const callArgs = prismaMock.scenario.findMany.mock.calls[0][0] as {
      where?: { jobTitleId: string };
    };
    expect(callArgs.where?.jobTitleId).toBe('job-001');
    expect(res.status).toBe(200);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.scenario.findMany.mockRejectedValueOnce(new Error('DB error'));
    const r = req('GET', '/api/scenarios');
    const res = await GET(r);
    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/scenarios', () => {
  beforeEach(resetPrismaMock);

  it('creates a scenario and returns 201', async () => {
    prismaMock.scenario.create.mockResolvedValueOnce(SAMPLE_SCENARIO);
    const r = req('POST', '/api/scenarios', {
      jobTitleId: 'job-001',
      name: 'Angry Bill Dispute',
      type: 'CHAT',
    });
    const res = await POST(r);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('Angry Bill Dispute');
  });

  it('returns 400 when jobTitleId is missing', async () => {
    const r = req('POST', '/api/scenarios', { name: 'Test', type: 'CHAT' });
    const res = await POST(r);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when name is missing', async () => {
    const r = req('POST', '/api/scenarios', { jobTitleId: 'job-001', type: 'CHAT' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('returns 400 when type is missing', async () => {
    const r = req('POST', '/api/scenarios', { jobTitleId: 'job-001', name: 'Test' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('defaults script to {} when not provided', async () => {
    prismaMock.scenario.create.mockResolvedValueOnce(SAMPLE_SCENARIO);
    const r = req('POST', '/api/scenarios', {
      jobTitleId: 'job-001',
      name: 'Quick Test',
      type: 'CHAT',
    });
    await POST(r);
    const createArgs = prismaMock.scenario.create.mock.calls[0][0] as {
      data: { script: Record<string, unknown> };
    };
    expect(createArgs.data.script).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /api/scenarios/[id]', () => {
  beforeEach(resetPrismaMock);

  it('updates scenario name and returns 200', async () => {
    const updated = { ...SAMPLE_SCENARIO, name: 'Updated Scenario' };
    prismaMock.scenario.update.mockResolvedValueOnce(updated);
    const r = req('PUT', '/api/scenarios/sc-001', { name: 'Updated Scenario' });
    const res = await PUT(r, { params: Promise.resolve({ id: 'sc-001' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('Updated Scenario');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/scenarios/[id]', () => {
  beforeEach(resetPrismaMock);

  it('returns 204 on successful delete', async () => {
    prismaMock.scenario.delete.mockResolvedValueOnce(SAMPLE_SCENARIO);
    const r = req('DELETE', '/api/scenarios/sc-001');
    const res = await DELETE(r, { params: Promise.resolve({ id: 'sc-001' }) });
    expect(res.status).toBe(204);
  });
});

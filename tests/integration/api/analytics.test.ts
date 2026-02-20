/**
 * Integration tests for /api/analytics
 *
 * Bridges tested:
 *   1. Returns correct totalSessions count
 *   2. Returns correct overallAvg across all scores
 *   3. Returns null overallAvg when no scores exist
 *   4. Returns empty array when no sessions
 *   5. scoreTrend groups by day (daily averages for last 60 days)
 *   6. byJobTitle aggregates per-job metrics
 *   7. byCriteria aggregates per-criterion metrics
 *   8. byType splits PHONE vs CHAT sessions
 *   9. Returns 500 on DB error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { GET } from '@/app/api/analytics/route';

// ─────────────────────────────────────────────────────────────────────────────

function makeSession(overrides: {
  id: string;
  type?: 'CHAT' | 'PHONE';
  jobTitleId?: string;
  jobTitleName?: string;
  endedAt?: Date;
  scores?: Array<{ score: number; criteriaId: string; criteria: { name: string; weight: number } }>;
}) {
  return {
    id: overrides.id,
    type: overrides.type ?? 'CHAT',
    jobTitleId: overrides.jobTitleId ?? 'job-001',
    endedAt: overrides.endedAt ?? new Date(),
    createdAt: new Date(),
    status: 'COMPLETED',
    jobTitle: { name: overrides.jobTitleName ?? 'Agent' },
    scenario: { id: 'sc-001', name: 'Test Scenario', type: overrides.type ?? 'CHAT' },
    scores: overrides.scores ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/analytics', () => {
  beforeEach(resetPrismaMock);

  it('returns 200 with analytics shape', async () => {
    prismaMock.simulationSession.findMany.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('totalSessions');
    expect(data).toHaveProperty('overallAvg');
    expect(data).toHaveProperty('scoreTrend');
    expect(data).toHaveProperty('byJobTitle');
    expect(data).toHaveProperty('byCriteria');
    expect(data).toHaveProperty('byType');
  });

  it('returns totalSessions = 0 when no sessions', async () => {
    prismaMock.simulationSession.findMany.mockResolvedValueOnce([]);
    const res = await GET();
    const data = await res.json();
    expect(data.totalSessions).toBe(0);
    expect(data.overallAvg).toBeNull();
  });

  it('counts sessions correctly', async () => {
    const sessions = [
      makeSession({ id: 's1', scores: [{ score: 7, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } }] }),
      makeSession({ id: 's2', scores: [{ score: 9, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } }] }),
    ];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();
    expect(data.totalSessions).toBe(2);
  });

  it('computes overall average correctly', async () => {
    // Two sessions: one with score 6 and one with score 8 → avg = 7.0
    const sessions = [
      makeSession({ id: 's1', scores: [{ score: 6, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } }] }),
      makeSession({ id: 's2', scores: [{ score: 8, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } }] }),
    ];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();
    expect(data.overallAvg).toBeCloseTo(7.0);
  });

  it('returns null overallAvg when sessions have no scores', async () => {
    const sessions = [makeSession({ id: 's1', scores: [] })];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();
    expect(data.overallAvg).toBeNull();
  });

  it('groups by job title correctly', async () => {
    const sessions = [
      makeSession({ id: 's1', jobTitleId: 'j1', jobTitleName: 'Billing Agent', scores: [{ score: 8, criteriaId: 'c1', criteria: { name: 'E', weight: 5 } }] }),
      makeSession({ id: 's2', jobTitleId: 'j1', jobTitleName: 'Billing Agent', scores: [{ score: 6, criteriaId: 'c1', criteria: { name: 'E', weight: 5 } }] }),
      makeSession({ id: 's3', jobTitleId: 'j2', jobTitleName: 'Tech Support', scores: [{ score: 9, criteriaId: 'c1', criteria: { name: 'E', weight: 5 } }] }),
    ];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();
    expect(data.byJobTitle).toHaveLength(2);

    const billing = data.byJobTitle.find((j: { name: string }) => j.name === 'Billing Agent');
    expect(billing.sessions).toBe(2);
    expect(billing.avg).toBeCloseTo(7.0);

    const tech = data.byJobTitle.find((j: { name: string }) => j.name === 'Tech Support');
    expect(tech.sessions).toBe(1);
    expect(tech.avg).toBeCloseTo(9.0);
  });

  it('splits CHAT vs PHONE sessions in byType', async () => {
    const sessions = [
      makeSession({ id: 's1', type: 'CHAT', scores: [] }),
      makeSession({ id: 's2', type: 'CHAT', scores: [] }),
      makeSession({ id: 's3', type: 'PHONE', scores: [] }),
    ];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();

    const chat = data.byType.find((t: { type: string }) => t.type === 'CHAT');
    const phone = data.byType.find((t: { type: string }) => t.type === 'PHONE');
    // byType uses { type, sessions, avg } — property is 'sessions' not 'count'
    expect(chat.sessions).toBe(2);
    expect(phone.sessions).toBe(1);
  });

  it('groups criteria scores correctly across sessions', async () => {
    const sessions = [
      makeSession({ id: 's1', scores: [
        { score: 8, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } },
        { score: 6, criteriaId: 'c2', criteria: { name: 'Resolution', weight: 8 } },
      ]}),
      makeSession({ id: 's2', scores: [
        { score: 9, criteriaId: 'c1', criteria: { name: 'Empathy', weight: 5 } },
      ]}),
    ];
    prismaMock.simulationSession.findMany.mockResolvedValueOnce(sessions);
    const res = await GET();
    const data = await res.json();

    const empathy = data.byCriteria.find((c: { name: string }) => c.name === 'Empathy');
    expect(empathy.count).toBe(2);
    expect(empathy.avg).toBeCloseTo(8.5);

    const resolution = data.byCriteria.find((c: { name: string }) => c.name === 'Resolution');
    expect(resolution.count).toBe(1);
    expect(resolution.avg).toBeCloseTo(6.0);
  });

  it('returns 500 on DB error', async () => {
    prismaMock.simulationSession.findMany.mockRejectedValueOnce(new Error('DB connection lost'));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

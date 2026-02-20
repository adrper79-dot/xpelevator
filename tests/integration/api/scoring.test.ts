/**
 * Integration tests for /api/scoring
 *
 * Bridges tested:
 *   1. POST saves scores and marks session COMPLETED — man successfully crossed, stamped
 *   2. POST saves multiple scores in a transaction    — every step stamped
 *   3. POST handles DB error gracefully (500)        — stamp machine broke, graceful fail
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { POST } from '@/app/api/scoring/route';

// ─────────────────────────────────────────────────────────────────────────────

function req(body: unknown): Request {
  return new Request('http://localhost/api/scoring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SCORES_INPUT = [
  { criteriaId: 'crit-001', score: 8, feedback: 'Good empathy shown.' },
  { criteriaId: 'crit-002', score: 9, feedback: 'Issue resolved on first call.' },
];

const CREATED_SCORES = SCORES_INPUT.map((s, i) => ({
  id: `score-00${i + 1}`,
  sessionId: 'sess-001',
  ...s,
  scoredAt: new Date(),
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/scoring', () => {
  beforeEach(resetPrismaMock);

  it('saves scores via transaction and marks session COMPLETED (201)', async () => {
    // $transaction returns array of created scores
    prismaMock.$transaction.mockResolvedValueOnce(CREATED_SCORES);
    prismaMock.simulationSession.update.mockResolvedValueOnce({ id: 'sess-001', status: 'COMPLETED' });

    const r = req({ sessionId: 'sess-001', scores: SCORES_INPUT });
    const res = await POST(r);

    expect(res.status).toBe(201);

    // Verify session was marked COMPLETED
    expect(prismaMock.simulationSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-001' },
      data: { status: 'COMPLETED', endedAt: expect.any(Date) },
    });
  });

  it('uses a transaction for atomic score creation', async () => {
    prismaMock.$transaction.mockResolvedValueOnce(CREATED_SCORES);
    prismaMock.simulationSession.update.mockResolvedValueOnce({});

    const r = req({ sessionId: 'sess-001', scores: SCORES_INPUT });
    await POST(r);

    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it('returns 500 when transaction fails', async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error('Transaction failed'));
    const r = req({ sessionId: 'sess-001', scores: SCORES_INPUT });
    const res = await POST(r);
    expect(res.status).toBe(500);
  });

  it('returns created scores in response body', async () => {
    prismaMock.$transaction.mockResolvedValueOnce(CREATED_SCORES);
    prismaMock.simulationSession.update.mockResolvedValueOnce({});

    const r = req({ sessionId: 'sess-001', scores: SCORES_INPUT });
    const res = await POST(r);
    const data = await res.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
    expect(data[0].score).toBe(8);
    expect(data[1].score).toBe(9);
  });
});

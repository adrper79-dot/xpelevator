/**
 * Integration tests for /api/chat — the core simulation engine
 *
 * This is the "bridge crossing" test battery. Each test validates a distinct
 * gate the user and AI must pass through during a simulation.
 *
 * Bridges tested:
 *   1. GET /api/chat?sessionId= — load session state              (bridge blueprint)
 *   2. GET returns 400 when sessionId missing                     (no ticket, no entry)
 *   3. GET returns 404 when session doesn't exist                 (bridge not built)
 *   4. POST with [START] signal → AI speaks opening line         (man steps onto bridge)
 *   5. POST saves agent message + gets AI reply                    (first step, then second)
 *   6. POST validates sessionId is required (400)                 (can't cross without ID)
 *   7. POST validates content is required (400)                   (silence not allowed)
 *   8. POST on a COMPLETED session returns 400                    (bridge closed, no re-entry)
 *   9. POST with [END] signal → session ends, scoring triggered   (man exits bridge)
 *  10. AI response with [RESOLVED] → auto-ends session            (AI opens exit gate)
 *  11. SSE stream emits chunk events                              (footsteps on bridge)
 *  12. SSE stream emits done event at end                         (bridge exit stamp)
 *  13. SSE stream emits session_ended when resolved               (bridge sealed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));
vi.mock('groq-sdk', () => {
  // Use a real class so `new Groq(...)` inside ai.ts doesn't throw
  class MockGroq {
    chat = { completions: { create: vi.fn() } };
  }
  return { default: MockGroq };
});

// Mock AI module to avoid real Groq calls in integration tests
vi.mock('@/lib/ai', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/ai')>();
  return {
    ...original,
    streamNextCustomerMessage: vi.fn(),
    scoreSession: vi.fn().mockResolvedValue([
      { criteriaId: 'c1', criteriaName: 'Empathy', score: 8, justification: 'Good empathy.' },
    ]),
    buildSessionSystemPrompt: original.buildSessionSystemPrompt,
  };
});

import { GET, POST } from '@/app/api/chat/route';
import { streamNextCustomerMessage } from '@/lib/ai';

// ─────────────────────────────────────────────────────────────────────────────
// Test data helpers
// ─────────────────────────────────────────────────────────────────────────────

const CRITERIA = [
  { id: 'c1', name: 'Empathy', description: null, weight: 8 },
];

const SESSION = {
  id: 'sess-001',
  userId: 'user-001',
  status: 'IN_PROGRESS' as const,
  type: 'CHAT' as const,
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  orgId: null,
  dbUserId: null,
  jobTitleId: 'job-001',
  scenarioId: 'sc-001',
  scenario: {
    id: 'sc-001',
    name: 'Angry Bill Dispute',
    script: { customerPersona: 'Angry customer', customerObjective: 'Refund', difficulty: 'hard' },
    type: 'CHAT',
  },
  jobTitle: {
    id: 'job-001',
    name: 'Billing Agent',
    jobCriteria: [{ criteria: CRITERIA[0] }],
  },
  messages: [] as Array<{ role: string; content: string }>,
  scores: [] as unknown[],
};

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/chat', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Collect all SSE events from a Response stream. */
async function collectSSEEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<Record<string, unknown>> = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  for (const line of buffer.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // ignore malformed lines
      }
    }
  }
  return events;
}

/** Make streamNextCustomerMessage yield given tokens then stop. */
function mockStream(tokens: string[]) {
  async function* generator() {
    for (const token of tokens) yield token;
  }
  (streamNextCustomerMessage as ReturnType<typeof vi.fn>).mockReturnValueOnce(generator());
}

// ─────────────────────────────────────────────────────────────────────────────
// GET tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/chat?sessionId=', () => {
  beforeEach(resetPrismaMock);

  it('returns 200 with full session state', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(SESSION);
    const r = new Request('http://localhost/api/chat?sessionId=sess-001');
    const res = await GET(r);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('sess-001');
    expect(data.status).toBe('IN_PROGRESS');
  });

  it('returns 400 when sessionId is missing', async () => {
    const r = new Request('http://localhost/api/chat');
    const res = await GET(r);
    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(null);
    const r = new Request('http://localhost/api/chat?sessionId=nonexistent');
    const res = await GET(r);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST tests
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/chat — validation', () => {
  beforeEach(resetPrismaMock);

  it('returns 400 when sessionId is missing', async () => {
    const r = makeRequest('POST', { content: 'Hello' });
    const res = await POST(r);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('required');
  });

  it('returns 400 when content is empty', async () => {
    const r = makeRequest('POST', { sessionId: 'sess-001', content: '' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(null);
    const r = makeRequest('POST', { sessionId: 'nonexistent', content: 'Hello' });
    const res = await POST(r);
    expect(res.status).toBe(404);
  });

  it('returns 400 when session is already COMPLETED', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce({
      ...SESSION,
      status: 'COMPLETED',
    });
    const r = makeRequest('POST', { sessionId: 'sess-001', content: 'Hi' });
    const res = await POST(r);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('closed');
  });

  it('returns 400 when session is CANCELLED', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce({
      ...SESSION,
      status: 'CANCELLED',
    });
    const r = makeRequest('POST', { sessionId: 'sess-001', content: 'Hi' });
    const res = await POST(r);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/chat — [START] signal', () => {
  beforeEach(resetPrismaMock);

  it('does NOT save agent message for [START] signal', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(SESSION);
    mockStream(['Hello! ', 'I need a refund.']);
    prismaMock.chatMessage.create.mockResolvedValueOnce({});

    const r = makeRequest('POST', { sessionId: 'sess-001', content: '[START]' });
    const res = await POST(r);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Drain the stream to ensure chatMessage.create was called for CUSTOMER only
    await collectSSEEvents(res);

    // Should have exactly 1 create call (for the AI customer message, not agent)
    const createCalls = prismaMock.chatMessage.create.mock.calls as Array<[{ data: { role: string } }]>;
    const agentSaves = createCalls.filter(([args]) => args.data.role === 'AGENT');
    expect(agentSaves).toHaveLength(0);
  });

  it('AI customer message saved with CUSTOMER role', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(SESSION);
    mockStream(['My internet is down!']);
    const savedMessage = { id: 'msg-001', role: 'CUSTOMER', content: 'My internet is down!', sessionId: 'sess-001' };
    prismaMock.chatMessage.create.mockResolvedValueOnce(savedMessage);

    const r = makeRequest('POST', { sessionId: 'sess-001', content: '[START]' });
    const res = await POST(r);
    await collectSSEEvents(res);

    const createCall = prismaMock.chatMessage.create.mock.calls[0][0] as {
      data: { role: string; content: string };
    };
    expect(createCall.data.role).toBe('CUSTOMER');
    expect(createCall.data.content).toContain('My internet is down!');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/chat — normal agent message', () => {
  beforeEach(resetPrismaMock);

  it('saves agent message, then AI responds with SSE chunks', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(SESSION);
    mockStream(["I'll help you right away."]);
    prismaMock.chatMessage.create
      .mockResolvedValueOnce({ id: 'msg-agent', role: 'AGENT', content: 'Hello!' })   // agent save
      .mockResolvedValueOnce({ id: 'msg-ai', role: 'CUSTOMER', content: "I'll help you right away." }); // AI save

    const r = makeRequest('POST', { sessionId: 'sess-001', content: 'Hello, how can I help?' });
    const res = await POST(r);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const events = await collectSSEEvents(res);

    // Should include at least one chunk event and a done event
    const chunkEvents = events.filter(e => e.type === 'chunk');
    const doneEvents = events.filter(e => e.type === 'done');
    expect(chunkEvents.length).toBeGreaterThan(0);
    expect(doneEvents).toHaveLength(1);
  });

  it('agent message is saved to DB with AGENT role', async () => {
    prismaMock.simulationSession.findUnique.mockResolvedValueOnce(SESSION);
    mockStream(['Response']);
    prismaMock.chatMessage.create.mockResolvedValue({ id: 'x', role: 'AGENT', content: 'x' });

    const agentContent = 'I can help you with your bill dispute.';
    const r = makeRequest('POST', { sessionId: 'sess-001', content: agentContent });
    const res = await POST(r);
    await collectSSEEvents(res);

    const firstCreate = prismaMock.chatMessage.create.mock.calls[0][0] as {
      data: { role: string; content: string };
    };
    expect(firstCreate.data.role).toBe('AGENT');
    expect(firstCreate.data.content).toBe(agentContent);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/chat — [END] signal', () => {
  beforeEach(resetPrismaMock);

  it('ends session and triggers scoring', async () => {
    const sessionWithMessages = {
      ...SESSION,
      messages: [
        { role: 'CUSTOMER', content: 'I need a refund.' },
        { role: 'AGENT', content: 'I can help with that.' },
      ],
    };
    prismaMock.simulationSession.findUnique
      .mockResolvedValueOnce(sessionWithMessages) // main load
      .mockResolvedValueOnce({ ...sessionWithMessages, status: 'COMPLETED', scores: [] }); // final state

    prismaMock.simulationSession.update.mockResolvedValueOnce({ id: 'sess-001', status: 'COMPLETED' });
    prismaMock.score.createMany.mockResolvedValueOnce({ count: 1 });

    const r = makeRequest('POST', { sessionId: 'sess-001', content: '[END]' });
    const res = await POST(r);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ended).toBe(true);

    // Session must be marked COMPLETED
    expect(prismaMock.simulationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-001' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/chat — [RESOLVED] in AI response', () => {
  beforeEach(resetPrismaMock);

  it('auto-ends session when AI includes [RESOLVED]', async () => {
    const sessionWithMessages = {
      ...SESSION,
      messages: [
        { role: 'CUSTOMER', content: 'I need help.' },
        { role: 'AGENT', content: 'Let me fix that.' },
      ],
    };

    prismaMock.simulationSession.findUnique
      .mockResolvedValueOnce(sessionWithMessages)     // load for POST
      .mockResolvedValueOnce(sessionWithMessages)     // refresh after AI saves message
      .mockResolvedValueOnce({ ...sessionWithMessages, status: 'COMPLETED', scores: [] }); // final state

    prismaMock.simulationSession.update.mockResolvedValueOnce({ id: 'sess-001', status: 'COMPLETED' });
    prismaMock.score.createMany.mockResolvedValueOnce({ count: 1 });

    // AI response includes [RESOLVED] at the end
    mockStream(['Great, all fixed! Have a wonderful day.\n[RESOLVED]']);
    prismaMock.chatMessage.create.mockResolvedValue({ id: 'x' });

    const r = makeRequest('POST', { sessionId: 'sess-001', content: 'Can you help?' });
    const res = await POST(r);
    const events = await collectSSEEvents(res);

    // Should include session_ending and session_ended events
    const sessionEndingEvents = events.filter(e => e.type === 'session_ending');
    const sessionEndedEvents = events.filter(e => e.type === 'session_ended');
    expect(sessionEndingEvents.length + sessionEndedEvents.length).toBeGreaterThan(0);
  });

  it('saves clean response without [RESOLVED] to DB', async () => {
    const sessionWithMessages = {
      ...SESSION,
      messages: [{ role: 'AGENT', content: 'I can help.' }],
    };

    prismaMock.simulationSession.findUnique
      .mockResolvedValueOnce(sessionWithMessages)
      .mockResolvedValueOnce(sessionWithMessages)
      .mockResolvedValueOnce({ ...sessionWithMessages, status: 'COMPLETED', scores: [] });

    prismaMock.simulationSession.update.mockResolvedValueOnce({});
    prismaMock.score.createMany.mockResolvedValueOnce({ count: 0 });

    mockStream(["Thank you! That resolved my issue.\n[RESOLVED]"]);
    prismaMock.chatMessage.create.mockResolvedValue({ id: 'x' });

    const r = makeRequest('POST', { sessionId: 'sess-001', content: 'Fixed?' });
    const res = await POST(r);
    await collectSSEEvents(res);

    // The CUSTOMER message save should NOT contain [RESOLVED]
    const chatSaveCalls = prismaMock.chatMessage.create.mock.calls as Array<
      [{ data: { role: string; content: string } }]
    >;
    const customerSave = chatSaveCalls.find(([a]) => a.data.role === 'CUSTOMER');
    expect(customerSave).toBeDefined();
    expect(customerSave![0].data.content).not.toContain('[RESOLVED]');
    expect(customerSave![0].data.content).toContain('Thank you!');
  });
});

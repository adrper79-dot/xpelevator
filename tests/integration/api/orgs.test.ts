/**
 * Integration tests for /api/orgs, /api/orgs/[id], /api/orgs/[id]/members
 *
 * Bridges tested:
 *   1. GET /api/orgs — org directory visible
 *   2. POST /api/orgs — new org created with auto-slug
 *   3. POST /api/orgs — rejects empty name (400)
 *   4. GET /api/orgs/[id] — specific org with member list visible
 *   5. GET /api/orgs/[id] — 404 when not found
 *   6. PUT /api/orgs/[id] — plan upgrade
 *   7. DELETE /api/orgs/[id] — successfully removes empty org (204)
 *   8. DELETE /api/orgs/[id] — blocked by existing sessions (409)
 *   9. GET /api/orgs/[id]/members — member list accessible
 *  10. POST /api/orgs/[id]/members — user invited (upsert)
 *  11. POST /api/orgs/[id]/members — 400 when email missing
 *  12. DELETE /api/orgs/[id]/members — member removed (204)
 *  13. DELETE /api/orgs/[id]/members — 404 when user not in org
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../mocks/prisma';

vi.mock('@/lib/prisma', () => ({ default: prismaMock }));

import { GET, POST } from '@/app/api/orgs/route';
import {
  GET as GET_ORG,
  PUT,
  DELETE,
} from '@/app/api/orgs/[id]/route';
import {
  GET as GET_MEMBERS,
  POST as INVITE_MEMBER,
  DELETE as REMOVE_MEMBER,
} from '@/app/api/orgs/[id]/members/route';

// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_ORG = {
  id: 'org-001',
  name: 'Acme Corp',
  slug: 'acme-corp',
  plan: 'FREE' as const,
  createdAt: new Date(),
  _count: { users: 3, sessions: 12 },
};

const SAMPLE_MEMBER = {
  id: 'user-001',
  email: 'alice@acme.com',
  name: 'Alice',
  role: 'MEMBER' as const,
  orgId: 'org-001',
  createdAt: new Date(),
};

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/orgs', () => {
  beforeEach(resetPrismaMock);

  it('returns list of orgs with _count', async () => {
    prismaMock.organization.findMany.mockResolvedValueOnce([SAMPLE_ORG]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].slug).toBe('acme-corp');
    expect(data[0]._count.users).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/orgs', () => {
  beforeEach(resetPrismaMock);

  it('creates org with auto-generated slug', async () => {
    const created = { ...SAMPLE_ORG, name: 'Beta Corp', slug: 'beta-corp' };
    prismaMock.organization.create.mockResolvedValueOnce(created);
    const r = req('POST', '/api/orgs', { name: 'Beta Corp' });
    const res = await POST(r);
    expect(res.status).toBe(201);

    const createArgs = prismaMock.organization.create.mock.calls[0][0] as {
      data: { name: string; slug: string };
    };
    expect(createArgs.data.slug).toBe('beta-corp');
  });

  it('uses provided slug when given', async () => {
    prismaMock.organization.create.mockResolvedValueOnce(SAMPLE_ORG);
    const r = req('POST', '/api/orgs', { name: 'Acme', slug: 'custom-slug' });
    await POST(r);
    const createArgs = prismaMock.organization.create.mock.calls[0][0] as {
      data: { slug: string };
    };
    expect(createArgs.data.slug).toBe('custom-slug');
  });

  it('returns 400 when name is empty', async () => {
    const r = req('POST', '/api/orgs', { name: '' });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('name is required');
  });

  it('returns 400 when name is missing', async () => {
    const r = req('POST', '/api/orgs', {});
    const res = await POST(r);
    expect(res.status).toBe(400);
  });

  it('auto-slug strips special characters', async () => {
    prismaMock.organization.create.mockResolvedValueOnce(SAMPLE_ORG);
    const r = req('POST', '/api/orgs', { name: 'Hello & World! 2024' });
    await POST(r);
    const createArgs = prismaMock.organization.create.mock.calls[0][0] as {
      data: { slug: string };
    };
    // Special chars replaced with '-', trimmed
    expect(createArgs.data.slug).toMatch(/^[a-z0-9-]+$/);
    expect(createArgs.data.slug).not.toMatch(/^-|-$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/orgs/[id]', () => {
  beforeEach(resetPrismaMock);

  it('returns org with members and counts', async () => {
    const orgDetail = { ...SAMPLE_ORG, users: [SAMPLE_MEMBER], _count: { sessions: 12, jobTitles: 3, scenarios: 5 } };
    prismaMock.organization.findUnique.mockResolvedValueOnce(orgDetail);
    const r = req('GET', '/api/orgs/org-001');
    const res = await GET_ORG(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.users).toHaveLength(1);
  });

  it('returns 404 when org not found', async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce(null);
    const r = req('GET', '/api/orgs/nonexistent');
    const res = await GET_ORG(r, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /api/orgs/[id]', () => {
  beforeEach(resetPrismaMock);

  it('upgrades plan to PRO', async () => {
    const updated = { ...SAMPLE_ORG, plan: 'PRO' as const };
    prismaMock.organization.update.mockResolvedValueOnce(updated);
    const r = req('PUT', '/api/orgs/org-001', { plan: 'PRO' });
    const res = await PUT(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).plan).toBe('PRO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/orgs/[id]', () => {
  beforeEach(resetPrismaMock);

  it('deletes empty org (204)', async () => {
    prismaMock.simulationSession.count.mockResolvedValueOnce(0);
    prismaMock.organization.delete.mockResolvedValueOnce(SAMPLE_ORG);
    const r = req('DELETE', '/api/orgs/org-001');
    const res = await DELETE(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(204);
  });

  it('returns 409 when org has sessions', async () => {
    prismaMock.simulationSession.count.mockResolvedValueOnce(5);
    const r = req('DELETE', '/api/orgs/org-001');
    const res = await DELETE(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('session');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/orgs/[id]/members', () => {
  beforeEach(resetPrismaMock);

  it('returns members list', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([SAMPLE_MEMBER]);
    const r = req('GET', '/api/orgs/org-001/members');
    const res = await GET_MEMBERS(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].email).toBe('alice@acme.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/orgs/[id]/members', () => {
  beforeEach(resetPrismaMock);

  it('invites a new user via upsert', async () => {
    prismaMock.user.upsert.mockResolvedValueOnce(SAMPLE_MEMBER);
    const r = req('POST', '/api/orgs/org-001/members', {
      email: 'alice@acme.com',
      role: 'MEMBER',
    });
    const res = await INVITE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(201);
    expect(prismaMock.user.upsert).toHaveBeenCalledOnce();
  });

  it('returns 400 when email is empty', async () => {
    const r = req('POST', '/api/orgs/org-001/members', { email: '' });
    const res = await INVITE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(400);
  });

  it('defaults role to MEMBER when not provided', async () => {
    prismaMock.user.upsert.mockResolvedValueOnce(SAMPLE_MEMBER);
    const r = req('POST', '/api/orgs/org-001/members', { email: 'bob@acme.com' });
    await INVITE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    const upsertArgs = prismaMock.user.upsert.mock.calls[0][0] as {
      create: { role: string };
    };
    expect(upsertArgs.create.role).toBe('MEMBER');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/orgs/[id]/members', () => {
  beforeEach(resetPrismaMock);

  it('removes member from org (204)', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(SAMPLE_MEMBER);
    prismaMock.user.update.mockResolvedValueOnce({ ...SAMPLE_MEMBER, orgId: null });
    const r = req('DELETE', '/api/orgs/org-001/members', { userId: 'user-001' });
    const res = await REMOVE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(204);
    // update clears orgId to null
    const updateArgs = prismaMock.user.update.mock.calls[0][0] as {
      data: { orgId: null };
    };
    expect(updateArgs.data.orgId).toBeNull();
  });

  it('returns 404 when user not found in org', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(null);
    const r = req('DELETE', '/api/orgs/org-001/members', { userId: 'ghost-user' });
    const res = await REMOVE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(404);
  });

  it('returns 400 when userId is missing', async () => {
    const r = req('DELETE', '/api/orgs/org-001/members', {});
    const res = await REMOVE_MEMBER(r, { params: Promise.resolve({ id: 'org-001' }) });
    expect(res.status).toBe(400);
  });
});

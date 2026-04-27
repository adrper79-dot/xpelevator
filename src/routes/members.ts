/**
 * Member profile routes.
 *
 * All routes require JWT authentication (mounted under /api/* middleware).
 *
 * POST /api/members         — create member profile for the authed user
 * GET  /api/members/me      — get current member profile
 * PATCH /api/members/me     — update display name / avatar
 */
import { Hono } from 'hono';
import { NotFoundError, ValidationError, ErrorCodes } from '@adrper79-dot/errors';
import { createDb } from '@adrper79-dot/neon';
import type { Env } from '../env.js';
import type { JwtVariables } from '../types.js';
import {
  getMemberByUserId,
  createMember,
  updateMember,
} from '../db/queries.js';

const router = new Hono<{ Bindings: Env; Variables: JwtVariables }>();

/** Create member profile. */
router.post('/', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json<{ email: string; displayName: string; avatarUrl?: string }>();

  if (!body.email || !body.displayName) {
    throw new ValidationError('email and displayName are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  const db = createDb(c.env.DB);

  // Idempotent: return existing member if already registered
  const existing = await getMemberByUserId(db, payload.sub);
  if (existing) {
    return c.json({ data: existing, error: null }, 200);
  }

  const member = await createMember(db, {
    userId: payload.sub,
    email: body.email,
    displayName: body.displayName,
    avatarUrl: body.avatarUrl,
  });

  return c.json({ data: member, error: null }, 201);
});

/** Get current member profile. */
router.get('/me', async (c) => {
  const payload = c.get('jwtPayload');
  const db = createDb(c.env.DB);
  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', {
      code: ErrorCodes.NOT_FOUND,
    });
  }
  return c.json({ data: member, error: null });
});

/** Update current member profile. */
router.patch('/me', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json<{ displayName?: string; avatarUrl?: string | null }>();

  const db = createDb(c.env.DB);
  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', {
      code: ErrorCodes.NOT_FOUND,
    });
  }

  const updated = await updateMember(db, member.id, {
    displayName: body.displayName,
    avatarUrl: body.avatarUrl,
  });

  return c.json({ data: updated, error: null });
});

export default router;

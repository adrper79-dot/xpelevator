/**
 * Journey browsing routes.
 *
 * GET /api/journeys         — list published journeys (?category=&difficulty=)
 * GET /api/journeys/:id     — get a single journey
 *
 * All routes require JWT authentication (mounted under /api/* middleware).
 */
import { Hono } from 'hono';
import { NotFoundError, ErrorCodes } from '@adrper79-dot/errors';
import { createDb } from '@adrper79-dot/neon';
import type { Env } from '../env.js';
import type { JwtVariables } from '../types.js';
import { listJourneys, getJourney } from '../db/queries.js';

const router = new Hono<{ Bindings: Env; Variables: JwtVariables }>();

/** List published journeys with optional filters. */
router.get('/', async (c) => {
  const category = c.req.query('category');
  const difficulty = c.req.query('difficulty');

  const db = createDb(c.env.DB);
  const rows = await listJourneys(db, { category, difficulty });
  return c.json({ data: rows, error: null });
});

/** Get a single published journey. */
router.get('/:id', async (c) => {
  const journeyId = c.req.param('id');
  const db = createDb(c.env.DB);
  const journey = await getJourney(db, journeyId);
  if (!journey || journey.status !== 'published') {
    throw new NotFoundError('Journey not found', { code: ErrorCodes.NOT_FOUND });
  }
  return c.json({ data: journey, error: null });
});

export default router;

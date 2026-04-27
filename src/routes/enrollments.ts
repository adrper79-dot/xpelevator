/**
 * Enrollment and milestone routes.
 *
 * POST  /api/enrollments                              — enroll in a journey
 * GET   /api/enrollments                              — list my enrollments
 * GET   /api/enrollments/:id                          — get enrollment + milestones
 * PATCH /api/enrollments/:id/status                   — pause / drop
 * PATCH /api/enrollments/:id/milestones/:milestoneId  — complete a milestone
 *
 * All routes require JWT authentication (mounted under /api/* middleware).
 */
import { Hono } from 'hono';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ErrorCodes,
} from '@adrper79-dot/errors';
import { createDb } from '@adrper79-dot/neon';
import type { Env } from '../env.js';
import type { JwtVariables } from '../types.js';
import {
  getMemberByUserId,
  getJourney,
  getEnrollmentsByMember,
  getEnrollmentForMember,
  createEnrollment,
  createMilestonesForEnrollment,
  getMilestonesByEnrollment,
  getMilestone,
  completeMilestone,
  setEnrollmentStatus,
  updateEnrollmentProgress,
} from '../db/queries.js';

const router = new Hono<{ Bindings: Env; Variables: JwtVariables }>();

/** Enroll the current member in a journey. */
router.post('/', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json<{ journeyId: string }>();

  if (!body.journeyId) {
    throw new ValidationError('journeyId is required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  const db = createDb(c.env.DB);

  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found — POST /api/members first', {
      code: ErrorCodes.NOT_FOUND,
    });
  }

  const journey = await getJourney(db, body.journeyId);
  if (!journey || journey.status !== 'published') {
    throw new NotFoundError('Journey not found', { code: ErrorCodes.NOT_FOUND });
  }

  const enrollment = await createEnrollment(db, {
    memberId: member.id,
    journeyId: journey.id,
  });

  // Create per-day milestones for this enrollment
  await createMilestonesForEnrollment(db, enrollment.id, journey);

  return c.json({ data: enrollment, error: null }, 201);
});

/** List current member's enrollments. */
router.get('/', async (c) => {
  const payload = c.get('jwtPayload');
  const db = createDb(c.env.DB);

  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    return c.json({ data: [], error: null });
  }

  const rows = await getEnrollmentsByMember(db, member.id);
  return c.json({ data: rows, error: null });
});

/** Get a single enrollment with its milestones. */
router.get('/:id', async (c) => {
  const payload = c.get('jwtPayload');
  const enrollmentId = c.req.param('id');
  const db = createDb(c.env.DB);

  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', { code: ErrorCodes.NOT_FOUND });
  }

  const enrollment = await getEnrollmentForMember(db, enrollmentId, member.id);
  if (!enrollment) {
    throw new NotFoundError('Enrollment not found', { code: ErrorCodes.NOT_FOUND });
  }

  const msList = await getMilestonesByEnrollment(db, enrollment.id);
  return c.json({ data: { enrollment, milestones: msList }, error: null });
});

/** Pause or drop an enrollment. */
router.patch('/:id/status', async (c) => {
  const payload = c.get('jwtPayload');
  const enrollmentId = c.req.param('id');
  const body = await c.req.json<{ status: string }>();

  const allowed = ['active', 'paused', 'dropped'] as const;
  type AllowedStatus = (typeof allowed)[number];

  if (!allowed.includes(body.status as AllowedStatus)) {
    throw new ValidationError(
      `status must be one of: ${allowed.join(', ')}`,
      { code: ErrorCodes.VALIDATION_ERROR },
    );
  }

  const db = createDb(c.env.DB);
  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', { code: ErrorCodes.NOT_FOUND });
  }

  const enrollment = await getEnrollmentForMember(db, enrollmentId, member.id);
  if (!enrollment) {
    throw new NotFoundError('Enrollment not found', { code: ErrorCodes.NOT_FOUND });
  }

  await setEnrollmentStatus(db, enrollmentId, body.status as AllowedStatus);
  return c.json({ data: { id: enrollmentId, status: body.status }, error: null });
});

/** Mark a milestone as completed and recalculate enrollment progress. */
router.patch('/:id/milestones/:milestoneId', async (c) => {
  const payload = c.get('jwtPayload');
  const enrollmentId = c.req.param('id');
  const milestoneId = c.req.param('milestoneId');
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));

  const db = createDb(c.env.DB);
  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', { code: ErrorCodes.NOT_FOUND });
  }

  // Verify the enrollment belongs to the member
  const enrollment = await getEnrollmentForMember(db, enrollmentId, member.id);
  if (!enrollment) {
    throw new NotFoundError('Enrollment not found', { code: ErrorCodes.NOT_FOUND });
  }

  // Verify the milestone belongs to this enrollment
  const milestone = await getMilestone(db, milestoneId);
  if (!milestone || milestone.enrollmentId !== enrollmentId) {
    throw new ForbiddenError('Milestone does not belong to this enrollment', {
      code: ErrorCodes.FORBIDDEN,
    });
  }

  const updated = await completeMilestone(db, milestoneId, body.notes);
  if (!updated) {
    throw new NotFoundError('Milestone not found', { code: ErrorCodes.NOT_FOUND });
  }

  // Recalculate progress percentage
  const allMilestones = await getMilestonesByEnrollment(db, enrollmentId);
  const completedCount = allMilestones.filter((m) => m.completed).length;
  const progressPct = allMilestones.length > 0
    ? (completedCount / allMilestones.length) * 100
    : 0;

  await updateEnrollmentProgress(db, enrollmentId, progressPct);

  return c.json({ data: updated, error: null });
});

export default router;

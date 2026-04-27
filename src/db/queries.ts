/**
 * All database query functions for xpelevator.
 * Uses Drizzle ORM with the Neon HTTP driver via @adrper79-dot/neon.
 */
import { eq, and, desc, asc, type InferSelectModel } from 'drizzle-orm';
import type { FactoryDb } from '@adrper79-dot/neon';
import {
  members,
  journeys,
  enrollments,
  milestones,
  subscriptions,
} from './schema.js';

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type Member = InferSelectModel<typeof members>;
export type Journey = InferSelectModel<typeof journeys>;
export type Enrollment = InferSelectModel<typeof enrollments>;
export type Milestone = InferSelectModel<typeof milestones>;
export type Subscription = InferSelectModel<typeof subscriptions>;

// ---------------------------------------------------------------------------
// Member queries
// ---------------------------------------------------------------------------

export async function getMemberByUserId(
  db: FactoryDb,
  userId: string,
): Promise<Member | null> {
  const rows = await db.select().from(members).where(eq(members.userId, userId));
  return rows[0] ?? null;
}

export interface CreateMemberOpts {
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export async function createMember(
  db: FactoryDb,
  opts: CreateMemberOpts,
): Promise<Member> {
  const rows = await db
    .insert(members)
    .values({
      userId: opts.userId,
      email: opts.email,
      displayName: opts.displayName,
      avatarUrl: opts.avatarUrl ?? null,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Insert did not return a row');
  return row;
}

export interface UpdateMemberOpts {
  displayName?: string;
  avatarUrl?: string | null;
  plan?: string;
  stripeCustomerId?: string | null;
}

export async function updateMember(
  db: FactoryDb,
  memberId: string,
  opts: UpdateMemberOpts,
): Promise<Member | null> {
  const rows = await db
    .update(members)
    .set({ ...opts, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning();
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Journey queries
// ---------------------------------------------------------------------------

export interface ListJourneysOpts {
  category?: string;
  difficulty?: string;
}

export async function listJourneys(
  db: FactoryDb,
  opts: ListJourneysOpts = {},
): Promise<Journey[]> {
  const conditions = [eq(journeys.status, 'published')];
  if (opts.category) conditions.push(eq(journeys.category, opts.category));
  if (opts.difficulty) conditions.push(eq(journeys.difficulty, opts.difficulty));

  return db
    .select()
    .from(journeys)
    .where(and(...conditions))
    .orderBy(asc(journeys.category), asc(journeys.title));
}

export async function getJourney(
  db: FactoryDb,
  journeyId: string,
): Promise<Journey | null> {
  const rows = await db.select().from(journeys).where(eq(journeys.id, journeyId));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Enrollment queries
// ---------------------------------------------------------------------------

export async function getEnrollmentsByMember(
  db: FactoryDb,
  memberId: string,
): Promise<Enrollment[]> {
  return db
    .select()
    .from(enrollments)
    .where(eq(enrollments.memberId, memberId))
    .orderBy(desc(enrollments.createdAt));
}

export async function getEnrollment(
  db: FactoryDb,
  enrollmentId: string,
): Promise<Enrollment | null> {
  const rows = await db
    .select()
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId));
  return rows[0] ?? null;
}

export async function getEnrollmentForMember(
  db: FactoryDb,
  enrollmentId: string,
  memberId: string,
): Promise<Enrollment | null> {
  const rows = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.memberId, memberId)));
  return rows[0] ?? null;
}

export interface CreateEnrollmentOpts {
  memberId: string;
  journeyId: string;
}

export async function createEnrollment(
  db: FactoryDb,
  opts: CreateEnrollmentOpts,
): Promise<Enrollment> {
  const rows = await db
    .insert(enrollments)
    .values({ memberId: opts.memberId, journeyId: opts.journeyId })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('Insert did not return a row');
  return row;
}

export async function updateEnrollmentProgress(
  db: FactoryDb,
  enrollmentId: string,
  progressPct: number,
): Promise<void> {
  const updates: Partial<Enrollment> = {
    progressPct,
    updatedAt: new Date(),
  };
  if (progressPct >= 100) {
    updates.status = 'completed';
    updates.completedAt = new Date();
  }
  await db.update(enrollments).set(updates).where(eq(enrollments.id, enrollmentId));
}

export async function setEnrollmentStatus(
  db: FactoryDb,
  enrollmentId: string,
  status: 'active' | 'paused' | 'dropped',
): Promise<void> {
  await db
    .update(enrollments)
    .set({ status, updatedAt: new Date() })
    .where(eq(enrollments.id, enrollmentId));
}

// ---------------------------------------------------------------------------
// Milestone queries
// ---------------------------------------------------------------------------

export async function getMilestonesByEnrollment(
  db: FactoryDb,
  enrollmentId: string,
): Promise<Milestone[]> {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.enrollmentId, enrollmentId))
    .orderBy(asc(milestones.dayNumber));
}

function parseMilestoneTitle(
  metadata: unknown,
  dayNumber: number,
): string {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'milestones' in metadata &&
    Array.isArray((metadata as Record<string, unknown>)['milestones'])
  ) {
    const defs = (metadata as { milestones: Array<{ day: number; title: string }> }).milestones;
    const def = defs.find((m) => m.day === dayNumber);
    if (def?.title) return def.title;
  }
  return `Day ${dayNumber}`;
}

export async function createMilestonesForEnrollment(
  db: FactoryDb,
  enrollmentId: string,
  journey: Journey,
): Promise<void> {
  if (journey.durationDays <= 0) return;

  const values = Array.from({ length: journey.durationDays }, (_, i) => ({
    enrollmentId,
    journeyId: journey.id,
    title: parseMilestoneTitle(journey.metadata, i + 1),
    dayNumber: i + 1,
  }));

  await db.insert(milestones).values(values);
}

export async function getMilestone(
  db: FactoryDb,
  milestoneId: string,
): Promise<Milestone | null> {
  const rows = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId));
  return rows[0] ?? null;
}

export async function completeMilestone(
  db: FactoryDb,
  milestoneId: string,
  notes?: string,
): Promise<Milestone | null> {
  const rows = await db
    .update(milestones)
    .set({ completed: true, completedAt: new Date(), notes: notes ?? null })
    .where(eq(milestones.id, milestoneId))
    .returning();
  return rows[0] ?? null;
}

export async function getMemberByStripeCustomerId(
  db: FactoryDb,
  stripeCustomerId: string,
): Promise<Member | null> {
  const rows = await db
    .select()
    .from(members)
    .where(eq(members.stripeCustomerId, stripeCustomerId));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Subscription queries
// ---------------------------------------------------------------------------

export async function getSubscriptionByMember(
  db: FactoryDb,
  memberId: string,
): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.memberId, memberId))
    .orderBy(desc(subscriptions.createdAt));
  return rows[0] ?? null;
}

export interface UpsertSubscriptionOpts {
  memberId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  status: string;
  currentPeriodEnd: Date;
}

export async function upsertSubscription(
  db: FactoryDb,
  opts: UpsertSubscriptionOpts,
): Promise<void> {
  await db
    .insert(subscriptions)
    .values(opts)
    .onConflictDoUpdate({
      target: subscriptions.memberId,
      set: {
        stripeCustomerId: opts.stripeCustomerId,
        stripePriceId: opts.stripePriceId,
        status: opts.status,
        currentPeriodEnd: opts.currentPeriodEnd,
        updatedAt: new Date(),
      },
    });
}

export async function updateSubscriptionStatus(
  db: FactoryDb,
  stripeCustomerId: string,
  status: string,
  currentPeriodEnd: Date,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({ status, currentPeriodEnd, updatedAt: new Date() })
    .where(eq(subscriptions.stripeCustomerId, stripeCustomerId));
}

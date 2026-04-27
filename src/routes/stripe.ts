/**
 * Stripe payment routes.
 *
 * POST /stripe/webhook              — incoming Stripe subscription lifecycle events (public)
 * POST /api/subscriptions/checkout  — create a Stripe Checkout session (authed)
 * GET  /api/subscriptions/me        — get current subscription status (authed)
 */
import { Hono } from 'hono';
import {
  NotFoundError,
  ValidationError,
  ErrorCodes,
} from '@adrper79-dot/errors';
import { createDb } from '@adrper79-dot/neon';
import {
  createStripeClient,
  stripeWebhookHandler,
  createCheckoutSession,
  getSubscription,
  type SubscriptionStatus,
} from '@adrper79-dot/stripe';
import type { Env } from '../env.js';
import type { JwtVariables } from '../types.js';
import {
  getMemberByUserId,
  getMemberByStripeCustomerId,
  upsertSubscription,
  updateSubscriptionStatus,
  updateMember,
} from '../db/queries.js';

// ---------------------------------------------------------------------------
// Webhook router (public — no JWT)
// ---------------------------------------------------------------------------

export const webhookRouter = new Hono<{ Bindings: Env }>();

webhookRouter.post('/stripe/webhook', async (c) => {
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  const stripeClient = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const db = createDb(c.env.DB);

  const handler = stripeWebhookHandler({
    webhookSecret,
    stripeClient,
    handlers: {
      created: async (status: SubscriptionStatus) => {
        const member = await getMemberByStripeCustomerId(db, status.customerId);
        if (member) {
          await upsertSubscription(db, {
            memberId: member.id,
            stripeCustomerId: status.customerId,
            stripePriceId: status.tier,
            status: status.status,
            currentPeriodEnd: status.currentPeriodEnd,
          });
        }
      },
      upgraded: async (status: SubscriptionStatus) => {
        await updateSubscriptionStatus(
          db,
          status.customerId,
          status.status,
          status.currentPeriodEnd,
        );
      },
      downgraded: async (status: SubscriptionStatus) => {
        await updateSubscriptionStatus(
          db,
          status.customerId,
          status.status,
          status.currentPeriodEnd,
        );
      },
      canceled: async (status: SubscriptionStatus) => {
        await updateSubscriptionStatus(
          db,
          status.customerId,
          'canceled',
          status.currentPeriodEnd,
        );
      },
      past_due: async (status: SubscriptionStatus) => {
        await updateSubscriptionStatus(
          db,
          status.customerId,
          'past_due',
          status.currentPeriodEnd,
        );
      },
    },
  });

  return handler(c, async () => {});
});

// ---------------------------------------------------------------------------
// Subscription API router (authed — mount under /api/*)
// ---------------------------------------------------------------------------

export const subscriptionRouter = new Hono<{
  Bindings: Env;
  Variables: JwtVariables;
}>();

/** Create a Stripe Checkout session for a plan upgrade. */
subscriptionRouter.post('/checkout', async (c) => {
  const payload = c.get('jwtPayload');
  const body = await c.req.json<{
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }>();

  if (!body.priceId || !body.successUrl || !body.cancelUrl) {
    throw new ValidationError('priceId, successUrl, and cancelUrl are required', {
      code: ErrorCodes.VALIDATION_ERROR,
    });
  }

  const db = createDb(c.env.DB);
  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', { code: ErrorCodes.NOT_FOUND });
  }

  const stripeClient = createStripeClient(c.env.STRIPE_SECRET_KEY);

  // Create Stripe customer if not yet linked
  let customerId = member.stripeCustomerId;
  if (!customerId) {
    const customer = await stripeClient.customers.create({
      email: member.email,
      metadata: { memberId: member.id, userId: member.userId },
    });
    customerId = customer.id;
    await updateMember(db, member.id, { stripeCustomerId: customerId });
  }

  const checkoutUrl = await createCheckoutSession({
    priceId: body.priceId,
    customerId,
    successUrl: body.successUrl,
    cancelUrl: body.cancelUrl,
    stripeClient,
  });

  return c.json({ data: { url: checkoutUrl }, error: null });
});

/** Get the current member's subscription status. */
subscriptionRouter.get('/me', async (c) => {
  const payload = c.get('jwtPayload');
  const db = createDb(c.env.DB);

  const member = await getMemberByUserId(db, payload.sub);
  if (!member) {
    throw new NotFoundError('Member profile not found', { code: ErrorCodes.NOT_FOUND });
  }

  if (!member.stripeCustomerId) {
    return c.json({
      data: { status: 'none', plan: member.plan },
      error: null,
    });
  }

  const stripeClient = createStripeClient(c.env.STRIPE_SECRET_KEY);
  const status = await getSubscription(member.stripeCustomerId, stripeClient);

  return c.json({ data: { ...status, plan: member.plan }, error: null });
});

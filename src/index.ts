import { Hono } from 'hono';
import {
  FactoryBaseError,
  withErrorBoundary,
  toErrorResponse,
} from '@adrper79-dot/errors';
import { jwtMiddleware } from '@adrper79-dot/auth';
import type { Env } from './env.js';
import memberRouter from './routes/members.js';
import journeyRouter from './routes/journeys.js';
import enrollmentRouter from './routes/enrollments.js';
import { webhookRouter, subscriptionRouter } from './routes/stripe.js';

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use('*', withErrorBoundary());

// ── Health check (public) ────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ status: 'ok', worker: c.env.WORKER_NAME, env: c.env.ENVIRONMENT }),
);

// ── Stripe webhook (public — signature-verified by the handler) ──────────────
app.route('/', webhookRouter);

// ── Protected routes (require JWT) ──────────────────────────────────────────
app.use('/api/*', (c, next) => jwtMiddleware(c.env.JWT_SECRET)(c, next));

app.get('/api/me', (c) => {
  return c.json({ data: c.get('jwtPayload'), error: null });
});

app.route('/api/members', memberRouter);
app.route('/api/journeys', journeyRouter);
app.route('/api/enrollments', enrollmentRouter);
app.route('/api/subscriptions', subscriptionRouter);

// ── Global unhandled error handler ───────────────────────────────────────────
app.onError((err, c) => {
  if (err instanceof FactoryBaseError) {
    return c.json(
      { error: { code: err.code, message: err.message }, data: null },
      err.status as 400 | 401 | 403 | 404 | 500,
    );
  }
  console.error('[unhandled]', err);
  return c.json(toErrorResponse(err), 500);
});

export default app;

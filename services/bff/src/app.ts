import { Hono } from 'hono';
import { type AppEnv, authenticate, requireScopes } from './auth.js';
import type { AuthConfig } from './config.js';
import type { UserStore } from './users.js';
import type { SubscriptionStore } from './subscriptions.js';
import { deriveEntitlements } from './domain/subscriptions.js';
import { requestLogger, type LogLevel } from './logging.js';

export function createApp(
  authConfig: AuthConfig,
  stores: { users: UserStore; subscriptions: SubscriptionStore },
  logLevel: LogLevel = 'info',
  now: () => Date = () => new Date(),
) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    c.header('Cache-Control', 'no-store');
    await next();
  });
  app.use('*', requestLogger(logLevel));

  app.onError((_error, c) => {
    return c.json(
      { error: { code: 'internal_error', requestId: c.get('requestId') } },
      500,
    );
  });

  // Public liveness endpoint; does not contact Auth0 or imply dependency readiness.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Register all user routes below this middleware; authentication is the default.
  app.use('*', authenticate(authConfig));
  app.use('*', async (c, next) => {
    if (c.get('machineIdentity')) {
      return c.json(
        {
          error: {
            code: 'user_identity_required',
            requestId: c.get('requestId'),
          },
        },
        403,
      );
    }
    await next();
  });
  app.get('/v1/me', requireScopes('read:me'), async (c) => {
    return c.json(await stores.users.getOrCreate(c.get('auth')));
  });
  app.get('/v1/me/subscriptions', requireScopes('read:me'), async (c) => {
    const user = await stores.users.getOrCreate(c.get('auth'));
    return c.json({ subscriptions: await stores.subscriptions.listForUser(user.userId) });
  });
  app.get('/v1/me/entitlements', requireScopes('read:me'), async (c) => {
    const user = await stores.users.getOrCreate(c.get('auth'));
    const subscriptions = await stores.subscriptions.listForUser(user.userId);
    return c.json(deriveEntitlements(subscriptions, now()));
  });
  app.get('/v1/premium/score-history', requireScopes('read:premium'), async (c) => {
    const user = await stores.users.getOrCreate(c.get('auth'));
    const subscriptions = await stores.subscriptions.listForUser(user.userId);
    const entitlements = deriveEntitlements(subscriptions, now());
    if (!entitlements.features.includes('score_history')) {
      return c.json({ error: { code: 'premium_required', requestId: c.get('requestId') } }, 403);
    }
    return c.json({
      synthetic: true,
      points: [
        { date: '2026-08-01', score: 91 },
        { date: '2026-09-01', score: 93 },
        { date: '2026-10-01', score: 94 },
      ],
    });
  });

  return app;
}

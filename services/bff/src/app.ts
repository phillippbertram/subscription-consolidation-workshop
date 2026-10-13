import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { CheckoutError } from './billing/contracts.js';
import { getVerifiedCheckoutEmail } from './billing/auth0-email.js';
import type { CheckoutService } from './billing/checkout-service.js';
import { type AppEnv, authenticate, requireScopes } from './auth.js';
import type { AuthConfig } from './config.js';
import type { UserStore } from './users.js';
import type { SubscriptionStore } from '@premiumpass/domain';
import { deriveEntitlements } from '@premiumpass/domain';
import { requestLogger } from './logging.js';
import type { LogLevel } from '@premiumpass/logging';

// Composition boundary: Hono owns HTTP parsing and responses; injected stores
// and services work with domain values and can also be used outside HTTP.
export function createApp(
  authConfig: AuthConfig,
  stores: { users: UserStore; subscriptions: SubscriptionStore },
  logLevel: LogLevel = 'info',
  now: () => Date = () => new Date(),
  options: { checkout?: CheckoutService; webOrigin?: string } = {},
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

  // Browsers send OPTIONS preflights without a Bearer token. Handle those
  // before authentication; CORS does not authorize the actual API request.
  if (options.webOrigin) {
    app.use(
      '/v1/*',
      cors({
        origin: options.webOrigin,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
        exposeHeaders: ['X-Request-Id'],
        maxAge: 600,
      }),
    );
  }

  app.onError((_error, c) => {
    if (_error instanceof CheckoutError) {
      return c.json(
        { error: { code: _error.code, requestId: c.get('requestId') } },
        _error.status,
      );
    }
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
    // A valid client-credentials token identifies an application, not a person
    // whose purchases and profile these /me routes are allowed to manage.
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
    // Ownership starts with the verified issuer/subject. A client-supplied userId
    // must never select another user's partition.
    const user = await stores.users.getOrCreate(c.get('auth'));
    return c.json({
      subscriptions: await stores.subscriptions.listForUser(user.userId),
    });
  });
  app.get('/v1/me/entitlements', requireScopes('read:me'), async (c) => {
    const user = await stores.users.getOrCreate(c.get('auth'));
    const subscriptions = await stores.subscriptions.listForUser(user.userId);
    // Sample time after the read: a persisted Premium snapshot may have expired
    // without a webhook. Enforce that boundary again on every API request.
    return c.json(deriveEntitlements(subscriptions, now()));
  });
  app.get(
    '/v1/premium/score-history',
    requireScopes('read:premium'),
    async (c) => {
      const user = await stores.users.getOrCreate(c.get('auth'));
      const subscriptions = await stores.subscriptions.listForUser(user.userId);
      const entitlements = deriveEntitlements(subscriptions, now());
      // Scope permits calling the API; an entitlement proves current product
      // access. A valid JWT with read:premium alone is not a paid subscription.
      if (!entitlements.features.includes('score_history')) {
        return c.json(
          {
            error: { code: 'premium_required', requestId: c.get('requestId') },
          },
          403,
        );
      }
      return c.json({
        synthetic: true,
        points: [
          { date: '2026-08-01', score: 91 },
          { date: '2026-09-01', score: 93 },
          { date: '2026-10-01', score: 94 },
        ],
      });
    },
  );

  app.post(
    '/v1/billing/stripe/checkout-session',
    requireScopes('write:checkout', 'openid', 'email'),
    bodyLimit({
      maxSize: 1024,
      onError: (c) =>
        c.json(
          {
            error: {
              code: 'invalid_checkout_request',
              requestId: String(c.get('requestId')),
            },
          },
          400,
        ),
    }),
    async (c) => {
      const origin = c.req.header('Origin');
      if (origin && origin !== options.webOrigin)
        return c.json(
          {
            error: {
              code: 'origin_not_allowed',
              requestId: c.get('requestId'),
            },
          },
          403,
        );
      if (!options.checkout)
        throw new CheckoutError('checkout_unavailable', 503);
      // The web client's useCheckout hook creates a UUID per purchase attempt,
      // stores it per user in sessionStorage, and reuses it for retries.
      // ApiClient.checkout (apps/web/src/api-client.ts) sends it in this header.
      // It is separate from the server-generated X-Request-Id for each HTTP call.
      // The backend derives Stripe's idempotency key from this attempt UUID:
      // https://docs.stripe.com/api/idempotent_requests
      const key = z.uuid().safeParse(c.req.header('Idempotency-Key'));
      // Only the plan is client input. Strict parsing rejects fields such as
      // userId, customerId, email, or price that the server must determine.
      const body = z
        .object({ planId: z.string().min(1).max(64) })
        .strict()
        .safeParse(await c.req.json<unknown>().catch(() => null));
      if (
        !key.success ||
        !body.success ||
        !c.req
          .header('Content-Type')
          ?.toLowerCase()
          .startsWith('application/json')
      )
        throw new CheckoutError('invalid_checkout_request', 400);
      const identity = c.get('auth');
      // The validated token establishes identity; UserInfo separately supplies
      // a verified billing email for that same subject.
      const verifiedEmail = await getVerifiedCheckoutEmail(
        authConfig,
        identity,
        c.req.header('Authorization') ?? '',
      );
      const user = await stores.users.getOrCreate(identity);
      return c.json(
        await options.checkout.start(
          user.userId,
          key.data,
          body.data.planId,
          verifiedEmail,
        ),
      );
    },
  );

  return app;
}

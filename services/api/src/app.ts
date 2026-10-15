import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CheckoutError } from './billing/contracts.js';
import type { AppleBilling } from './billing/apple.js';
import { type AppEnv, authenticate } from './auth.js';
import type { AuthConfig } from './config.js';
import type { UserStore } from './users.js';
import type { SubscriptionStore } from '@premiumpass/domain';
import { requestLogger } from './logging.js';
import type { LogLevel } from '@premiumpass/logging';
import { registerUsersRoutes } from './routes/users.js';
import { registerSubscriptionsRoutes } from './routes/subscriptions.js';
import { registerPremiumRoutes } from './routes/premium.js';
import { registerAppleRoutes } from './routes/apple.js';
import {
  registerStripeRoutes,
  type StripeRouteOptions,
} from './routes/stripe.js';

// Composition boundary: Hono owns HTTP parsing and responses; injected stores
// and services work with domain values and can also be used outside HTTP.
export function createApp(
  authConfig: AuthConfig,
  stores: { users: UserStore; subscriptions: SubscriptionStore },
  logLevel: LogLevel = 'info',
  now: () => Date = () => new Date(),
  options: StripeRouteOptions & {
    apple?: AppleBilling | undefined;
  } = {},
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
  registerUsersRoutes(app, stores.users);
  registerSubscriptionsRoutes(app, stores.users, stores.subscriptions, now);
  registerPremiumRoutes(app, stores.users, stores.subscriptions, now);
  registerAppleRoutes(app, stores.users, options.apple);
  registerStripeRoutes(app, authConfig, stores.users, options);

  return app;
}

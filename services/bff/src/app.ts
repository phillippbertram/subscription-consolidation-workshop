import { Hono } from 'hono';
import { type AppEnv, authenticate, requireScopes } from './auth.js';
import type { AuthConfig } from './config.js';

export function createApp(authConfig: AuthConfig) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.onError((_error, c) => {
    console.error(
      JSON.stringify({ code: 'internal_error', requestId: c.get('requestId') }),
    );
    return c.json(
      { error: { code: 'internal_error', requestId: c.get('requestId') } },
      500,
    );
  });

  // Public liveness endpoint; does not contact Auth0 or imply dependency readiness.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Register all user routes below this middleware; authentication is the default.
  app.use('*', authenticate(authConfig));
  app.get('/v1/me', requireScopes('read:me'), (c) => c.json(c.get('auth')));

  return app;
}

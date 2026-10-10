import { Hono } from 'hono';

export function createApp() {
  const app = new Hono();

  // Public liveness endpoint; does not imply that external services are ready.
  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
}

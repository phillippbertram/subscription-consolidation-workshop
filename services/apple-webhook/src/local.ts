import { serve } from '@hono/node-server';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createAppleWebhookRuntime } from './runtime.js';

const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-apple-webhook',
);
const runtime = createAppleWebhookRuntime(process.env, true, log);
const server = serve(
  { fetch: runtime.app.fetch, hostname: '127.0.0.1', port: 3003 },
  () => {
    log.info({
      event: 'apple.webhook_started',
      port: 3003,
      appleEnabled: runtime.appleEnabled,
    });
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => runtime.close()));
}

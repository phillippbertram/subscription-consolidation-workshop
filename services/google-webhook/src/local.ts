import { serve } from '@hono/node-server';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createGoogleWebhookRuntime } from './runtime.js';

const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-google-webhook',
);
const runtime = createGoogleWebhookRuntime(process.env, true, log);
const server = serve(
  { fetch: runtime.app.fetch, hostname: '127.0.0.1', port: 3004 },
  () => {
    log.info({
      event: 'google.webhook_started',
      port: 3004,
      googleEnabled: runtime.googleEnabled,
    });
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => runtime.close()));
}

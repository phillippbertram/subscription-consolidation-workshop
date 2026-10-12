import { serve } from '@hono/node-server';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { webhookRuntime } from './runtime.js';

const log = createLogger(readLogLevel(process.env), 'premiumpass-webhook');
const app = await webhookRuntime(true, log);
const server = serve(
  { fetch: app.fetch, hostname: '127.0.0.1', port: 3002 },
  () => {
    log.info({
      event: 'webhook.started',
      url: 'http://127.0.0.1:3002/v1/webhooks/stripe',
    });
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => server.close());

import { serve } from '@hono/node-server';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  createAppleVerifier,
  readAppleSettings,
} from '@premiumpass/apple-store';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createAppleWebhookApp } from './app.js';

const settings = readAppleSettings(process.env);
const queueUrl = process.env.SUBSCRIPTION_QUEUE_URL;
if (
  settings &&
  (!queueUrl || new URL(queueUrl).origin !== 'http://127.0.0.1:9324')
)
  throw new Error(
    'Apple local ingress requires SUBSCRIPTION_QUEUE_URL at http://127.0.0.1:9324.',
  );
const sqs = new SQSClient({
  endpoint: 'http://127.0.0.1:9324',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  maxAttempts: 2,
  requestHandler: { connectionTimeout: 1_000, requestTimeout: 3_000 },
});
const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-apple-webhook',
);
const app = createAppleWebhookApp(
  settings,
  settings ? createAppleVerifier(settings) : undefined,
  async (job) => {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(job),
      }),
    );
  },
  log,
);
const server = serve(
  { fetch: app.fetch, hostname: '127.0.0.1', port: 3003 },
  () => {
    log.info({
      event: 'apple.webhook_started',
      port: 3003,
      appleEnabled: Boolean(settings),
    });
  },
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => server.close(() => sqs.destroy()));

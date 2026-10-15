import { handle } from '@hono/aws-lambda';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createAppleWebhookRuntime } from './runtime.js';

const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-apple-webhook',
);
let runtime: ReturnType<typeof createAppleWebhookRuntime> | undefined;

export async function handler(
  ...[event, context]: Parameters<ReturnType<typeof handle>>
) {
  try {
    runtime ??= createAppleWebhookRuntime(process.env, false, log);
    return await handle(runtime.app)(event, context);
  } catch {
    log.error({
      event: 'apple.webhook_unavailable',
      requestId: context?.awsRequestId,
    });
    return { statusCode: 503, body: '{"error":"apple_webhook_unavailable"}' };
  }
}

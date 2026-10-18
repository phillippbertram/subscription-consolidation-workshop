import { handle } from '@hono/aws-lambda';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { createGoogleWebhookRuntime } from './runtime.js';

const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-google-webhook',
);
let runtime: ReturnType<typeof createGoogleWebhookRuntime> | undefined;

export async function handler(
  ...[event, context]: Parameters<ReturnType<typeof handle>>
) {
  try {
    runtime ??= createGoogleWebhookRuntime(process.env, false, log);
    return await handle(runtime.app)(event, context);
  } catch {
    log.error({
      event: 'google.webhook_unavailable',
      requestId: context?.awsRequestId,
    });
    return { statusCode: 503, body: '{"error":"google_webhook_unavailable"}' };
  }
}

import { handle } from '@hono/aws-lambda';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { webhookRuntime } from './runtime.js';

const log = createLogger(readLogLevel(process.env), 'premiumpass-webhook');
export async function handler(
  ...[event, context]: Parameters<ReturnType<typeof handle>>
) {
  try {
    // Hono's Lambda adapter decodes base64 bodies before signature verification.
    const app = await webhookRuntime(false, log);
    return await handle(app)(event, context);
  } catch {
    log.error({
      event: 'webhook.unavailable',
      requestId: context?.awsRequestId,
    });
    return { statusCode: 503, body: '{"error":"webhook_unavailable"}' };
  }
}

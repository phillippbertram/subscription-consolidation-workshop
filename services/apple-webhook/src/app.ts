import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { appleJobSchema, type AppleJob } from '@premiumpass/billing-contracts';
import {
  VerificationException,
  VerificationStatus,
  type AppleVerifier,
  type AppleSettings,
} from '@premiumpass/apple-store';
import type { Logger } from 'pino';

export function createAppleWebhookApp(
  settings: AppleSettings | undefined,
  verifier: AppleVerifier | undefined,
  enqueue: (job: AppleJob) => Promise<void>,
  log: Logger,
) {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 256 * 1024 }));
  app.get('/health', (c) =>
    c.json({ status: 'ok', appleEnabled: Boolean(settings) }),
  );
  app.post('/v1/webhooks/apple', async (c) => {
    if (!settings || !verifier) {
      return c.json({ error: 'apple_not_configured' }, 503);
    }

    const body = z
      .object({ signedPayload: z.string().min(1).max(250_000) })
      .strict()
      .safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) {
      return c.json({ error: 'invalid_notification' }, 400);
    }

    const correlationId = randomUUID();
    let job: AppleJob;
    try {
      const notification = await verifier.verifyAndDecodeNotification(
        body.data.signedPayload,
      );
      if (notification.notificationType === 'TEST') {
        return c.json({ received: true, test: true });
      }

      if (!notification.data?.signedTransactionInfo) {
        return c.json({ received: true, ignored: true });
      }

      const transaction = await verifier.verifyAndDecodeTransaction(
        notification.data.signedTransactionInfo,
      );
      if (transaction.productId !== settings.productId) {
        return c.json({ received: true, ignored: true });
      }

      job = appleJobSchema.parse({
        provider: 'apple',
        environment: 'Sandbox',
        eventId: notification.notificationUUID,
        eventType: 'notification',
        transactionId: transaction.originalTransactionId,
        userId: transaction.appAccountToken?.toLowerCase(),
        receivedAt: new Date().toISOString(),
        correlationId,
      });
    } catch (error) {
      // Certificate-status outages are retryable; payloads/SDK errors stay out of logs.
      const retry =
        error instanceof VerificationException &&
        error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE;
      log.warn({ event: 'apple.notification_rejected', correlationId, retry });
      return c.json(
        { error: retry ? 'verification_unavailable' : 'invalid_notification' },
        retry ? 503 : 400,
      );
    }

    try {
      await enqueue(job);
      log.info({
        event: 'apple.notification_queued',
        correlationId,
        eventId: job.eventId,
      });
      return c.json({ received: true });
    } catch {
      return c.json({ error: 'queue_unavailable' }, 503);
    }
  });
  app.onError(() =>
    Response.json({ error: 'apple_webhook_unavailable' }, { status: 503 }),
  );
  return app;
}

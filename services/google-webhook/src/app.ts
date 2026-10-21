import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { Logger } from 'pino';
import {
  googleJobSchema,
  type GoogleJob,
} from '@premiumpass/billing-contracts';
import {
  googleSubscriptionId,
  purchaseTokenSchema,
  type GoogleSettings,
  type GooglePushSettings,
} from '@premiumpass/google-play';
import { summarizeGoogleNotification } from './log-summary.js';

const envelopeSchema = z.object({
  subscription: z.string(),
  message: z.object({
    messageId: z.string().regex(/^[0-9]{1,100}$/),
    data: z.base64().max(80000),
  }),
});
const notificationSchema = z
  .object({
    packageName: z.string(),
    // Only read for the log summary; it never decides anything.
    eventTimeMillis: z.union([z.string(), z.number()]).optional(),
    subscriptionNotification: z
      .object({
        purchaseToken: purchaseTokenSchema,
        notificationType: z.number().int().positive(),
      })
      .optional(),
    voidedPurchaseNotification: z
      .object({
        purchaseToken: purchaseTokenSchema,
        productType: z.number().int(),
      })
      .optional(),
    testNotification: z.object({}).optional(),
    oneTimeProductNotification: z.object({}).optional(),
  })
  .refine(
    (value) =>
      [
        value.subscriptionNotification,
        value.voidedPurchaseNotification,
        value.testNotification,
        value.oneTimeProductNotification,
      ].filter(Boolean).length === 1,
  );

/** Verify Pub/Sub identity before inspecting data; acknowledge only queue acceptance. */
export function createGoogleWebhookApp(
  settings: GoogleSettings | undefined,
  push: GooglePushSettings | undefined,
  verify: ((token: string) => Promise<void>) | undefined,
  enqueue: (job: GoogleJob) => Promise<void>,
  log: Logger,
) {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 128 * 1024 }));
  app.get('/health', (c) =>
    c.json({ status: 'ok', googleEnabled: Boolean(settings) }),
  );
  app.post('/v1/webhooks/google', async (c) => {
    const correlationId = randomUUID();
    // Every rejection below names its reason, so the log answers "why did
    // Pub/Sub get a 4xx?" without reading the code. Tokens and bodies are
    // never logged.
    const reject = (reason: string, extra: Record<string, string> = {}) =>
      log.warn({
        event: 'google.notification_rejected',
        correlationId,
        reason,
        ...extra,
      });

    if (!settings || !push || !verify) {
      reject('google_not_configured');
      return c.json({ error: 'google_not_configured' }, 503);
    }

    const bearer = /^Bearer ([A-Za-z0-9_.-]{1,16384})$/i.exec(
      c.req.header('Authorization') ?? '',
    )?.[1];
    if (!bearer) {
      reject('authentication_required');
      return c.json({ error: 'authentication_required' }, 401);
    }

    try {
      await verify(bearer);
    } catch {
      reject('invalid_push_identity');
      return c.json({ error: 'invalid_push_identity' }, 401);
    }

    const envelope = envelopeSchema.safeParse(
      await c.req.json<unknown>().catch(() => null),
    );
    if (!envelope.success) {
      // Usually payload unwrapping is on, so the body is not Pub/Sub's envelope.
      reject('invalid_envelope');
      return c.json({ error: 'invalid_notification' }, 400);
    }

    if (envelope.data.subscription !== push.subscription) {
      // Both names are resource identifiers, and comparing them is the fix.
      reject('subscription_mismatch', {
        receivedSubscription: envelope.data.subscription,
        expectedSubscription: push.subscription,
      });
      return c.json({ error: 'invalid_notification' }, 400);
    }

    const pubsub = {
      messageId: envelope.data.message.messageId,
      subscription: envelope.data.subscription,
    };
    let notification;
    try {
      notification = notificationSchema.parse(
        JSON.parse(
          Buffer.from(envelope.data.message.data, 'base64').toString('utf8'),
        ) as unknown,
      );
    } catch {
      reject('invalid_message', { pubsubMessageId: pubsub.messageId });
      return c.json({ error: 'invalid_notification' }, 400);
    }

    if (notification.packageName !== settings.packageName) {
      reject('package_mismatch', {
        receivedPackage: notification.packageName,
        expectedPackage: settings.packageName,
        pubsubMessageId: pubsub.messageId,
      });
      return c.json({ error: 'package_mismatch' }, 400);
    }

    if (notification.testNotification) {
      log.info({
        event: 'google.notification_ignored',
        correlationId,
        reason: 'test',
        ...summarizeGoogleNotification(notification, pubsub),
      });
      return c.json({ received: true, test: true });
    }

    const purchaseToken =
      notification.subscriptionNotification?.purchaseToken ??
      (notification.voidedPurchaseNotification?.productType === 1
        ? notification.voidedPurchaseNotification.purchaseToken
        : undefined);
    if (!purchaseToken) {
      log.info({
        event: 'google.notification_ignored',
        correlationId,
        reason: 'not_a_subscription_event',
        ...summarizeGoogleNotification(notification, pubsub),
      });
      return c.json({ received: true, ignored: true });
    }

    // Log what Google said before queueing. The digest replaces the token and
    // matches the subscription ID that the worker and the database use.
    log.info({
      event: 'google.notification_received',
      correlationId,
      ...summarizeGoogleNotification(
        notification,
        pubsub,
        googleSubscriptionId(settings, purchaseToken),
      ),
    });

    const eventId = `rtdn_${createHash('sha256').update(`${push.subscription}:${envelope.data.message.messageId}`).digest('hex')}`;
    const job = googleJobSchema.parse({
      provider: 'google',
      environment: 'test',
      eventType: 'notification',
      packageName: settings.packageName,
      eventId,
      purchaseToken,
      correlationId,
      receivedAt: new Date().toISOString(),
    });
    try {
      await enqueue(job);
      log.info({ event: 'google.notification_queued', eventId, correlationId });
      return c.json({ received: true });
    } catch {
      return c.json({ error: 'queue_unavailable' }, 503);
    }
  });
  app.onError(() =>
    Response.json({ error: 'google_webhook_unavailable' }, { status: 503 }),
  );
  return app;
}

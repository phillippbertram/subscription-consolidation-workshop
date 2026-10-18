import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import Stripe from 'stripe';
import type { Logger } from 'pino';
import {
  eventTypes,
  jobSchema,
  type StripeJob,
} from '@premiumpass/billing-contracts';

// Stripe is the caller, so its signature replaces the user JWT boundary.
// This app deliberately avoids the API user-auth middleware and body logger.
export function createWebhookApp(
  signingSecret: string,
  enqueue: (job: StripeJob) => Promise<void>,
  log: Logger,
) {
  const app = new Hono();
  app.use('*', bodyLimit({ maxSize: 256 * 1024 }));
  app.post('/v1/webhooks/stripe', async (c) => {
    const correlationId = randomUUID();
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'invalid_signature' }, 400);
    }

    let event: Stripe.Event;
    try {
      const raw = Buffer.from(await c.req.arrayBuffer());
      // No JSON parser, text re-encoding, Auth0 middleware, or body logger here.
      event = Stripe.webhooks.constructEvent(raw, signature, signingSecret);
    } catch {
      log.warn({
        event: 'webhook.rejected',
        correlationId,
        code: 'invalid_signature',
      });
      return c.json({ error: 'invalid_signature' }, 400);
    }

    if (event.livemode !== false || event.account) {
      return c.json({ error: 'unsupported_account' }, 400);
    }

    if (!eventTypes.some((type) => type === event.type)) {
      return c.json({ received: true, ignored: true });
    }

    // Queue references and trace metadata only. Fetching current provider state
    // later prevents delayed webhooks from applying stale subscription payloads.
    const parsed = jobSchema.safeParse({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      objectId: 'id' in event.data.object ? event.data.object.id : undefined,
      receivedAt: new Date().toISOString(),
      correlationId,
    });
    if (!parsed.success) {
      return c.json({ error: 'invalid_event' }, 400);
    }

    try {
      // Await acceptance before 200, otherwise a crash could lose the event.
      // Losing the HTTP response after acceptance can duplicate it, which is safe.
      await enqueue(parsed.data);
      log.info({
        event: 'webhook.queued',
        correlationId,
        providerEventId: event.id,
        eventType: event.type,
      });
      return c.json({ received: true });
    } catch {
      log.error({
        event: 'webhook.queue_failed',
        correlationId,
        providerEventId: event.id,
      });
      // Stripe can retry this failed handoff; nothing has granted access or
      // marked the provider event as processed yet.
      return c.json({ error: 'queue_unavailable' }, 503);
    }
  });
  // Unexpected failures return 503 so Stripe retries the delivery later.
  app.onError(() => webhookUnavailable());
  return app;
}

function webhookUnavailable() {
  return Response.json({ error: 'webhook_unavailable' }, { status: 503 });
}

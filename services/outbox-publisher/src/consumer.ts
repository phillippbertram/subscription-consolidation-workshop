import type { Logger } from 'pino';
import { envelopeSchema } from './events.js';

export function consumeEvent(value: unknown, log: Logger) {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('invalid_subscription_event');
  }

  const { id, detail } = parsed.data;
  // Log duplicates with their stable domain ID. There are no access writes or
  // other side effects requiring a separate consumer deduplication store.
  // If this later sends email or updates another system, design durable effect
  // deduplication first; acknowledging a delivery alone cannot prevent duplicates.
  log.info({
    event: 'subscription.changed',
    domainEventId: detail.domainEventId,
    publishedEventId: id,
    correlationId: detail.correlationId,
    revision: detail.revision,
    tier: detail.entitlements.tier,
  });
}

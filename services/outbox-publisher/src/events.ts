import { subscriptionSchema } from '@premiumpass/domain';
import { z } from 'zod';

export const EVENT_SOURCE = 'premiumpass.subscriptions';

// The event carries the committed snapshot, never a fresh access calculation.
export const subscriptionChangedSchema = z
  .object({
    domainEventId: z.string().min(1),
    userId: z.uuid(),
    revision: z.number().int().positive(),
    type: z.literal('SubscriptionChanged'),
    providerEventId: z.string().min(1),
    correlationId: z.string().min(1),
    createdAt: z.iso.datetime(),
    entitlements: z.object({
      tier: z.enum(['free', 'premium']),
      features: z.array(z.literal('score_history')),
      effectiveUntil: z.iso.datetime().nullable(),
      evaluatedAt: z.iso.datetime(),
      grants: z.array(
        z.object({
          provider: subscriptionSchema.shape.provider,
          providerSubscriptionId: z.string().min(1),
          revision: z.number().int().positive(),
          validUntil: z.iso.datetime(),
        }),
      ),
      warnings: z.array(
        z.object({
          provider: z.string(),
          providerSubscriptionId: z.string(),
          reason: z.string(),
        }),
      ),
    }),
  })
  .refine(
    (event) => event.domainEventId === `${event.userId}:${event.revision}`,
  );

export type SubscriptionChanged = z.infer<typeof subscriptionChangedSchema>;

export const envelopeSchema = z.object({
  id: z.string().min(1),
  source: z.literal(EVENT_SOURCE),
  'detail-type': z.literal('SubscriptionChanged'),
  time: z.iso.datetime(),
  detail: subscriptionChangedSchema,
});

export function eventEnvelope(event: SubscriptionChanged, id: string) {
  return {
    id,
    source: EVENT_SOURCE,
    'detail-type': event.type,
    time: event.createdAt,
    detail: event,
  };
}

import { z } from 'zod';

export const eventTypes = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

const baseJobSchema = z.strictObject({
  receivedAt: z.iso.datetime(),
  correlationId: z.uuid(),
});

export const jobSchema = baseJobSchema
  .extend({
    provider: z.literal('stripe'),
    eventId: z.string().regex(/^evt_[A-Za-z0-9]+$/),
    eventType: z.enum(eventTypes),
    objectId: z.string().regex(/^(cs_test_|sub_|in_)[A-Za-z0-9]+$/),
  })
  .superRefine((job, context) => {
    const prefix = job.eventType.startsWith('checkout.')
      ? 'cs_test_'
      : job.eventType.startsWith('invoice.')
        ? 'in_'
        : 'sub_';
    if (!job.objectId.startsWith(prefix)) {
      context.addIssue({
        code: 'custom',
        message: 'Event object type mismatch.',
      });
    }
  });
export type StripeJob = z.infer<typeof jobSchema>;

export const appleJobSchema = baseJobSchema.extend({
  provider: z.literal('apple'),
  environment: z.literal('Sandbox'),
  eventId: z.uuid(),
  eventType: z.enum(['client.sync', 'notification']),
  transactionId: z.string().regex(/^[0-9]{1,64}$/),
  userId: z.uuid(),
});
export type AppleJob = z.infer<typeof appleJobSchema>;
export const subscriptionJobSchema = z.discriminatedUnion('provider', [
  jobSchema,
  appleJobSchema,
]);
export type SubscriptionJob = z.infer<typeof subscriptionJobSchema>;

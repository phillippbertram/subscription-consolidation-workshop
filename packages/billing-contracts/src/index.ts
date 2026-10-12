import { z } from 'zod';

export const eventTypes = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

export const jobSchema = z
  .object({
    provider: z.literal('stripe'),
    eventId: z.string().regex(/^evt_[A-Za-z0-9]+$/),
    eventType: z.enum(eventTypes),
    objectId: z.string().regex(/^(cs_test_|sub_|in_)[A-Za-z0-9]+$/),
    receivedAt: z.iso.datetime(),
    correlationId: z.uuid(),
  })
  .strict()
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

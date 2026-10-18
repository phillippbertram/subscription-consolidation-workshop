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

export const stripeReconciliationJobSchema = baseJobSchema.extend({
  provider: z.literal('stripe'),
  eventId: z.string().regex(/^reconcile_[0-9a-f-]{36}_sub_[A-Za-z0-9]+$/),
  eventType: z.literal('reconciliation'),
  expectedUserId: z.uuid(),
  objectId: z.string().regex(/^sub_[A-Za-z0-9]+$/),
});
export type StripeReconciliationJob = z.infer<
  typeof stripeReconciliationJobSchema
>;

export const googleMockIdSchema = z
  .string()
  .regex(/^mock_google_[A-Za-z0-9_-]{1,80}$/);
export const googleMockJobSchema = baseJobSchema.extend({
  provider: z.literal('google_mock'),
  eventId: z.string().min(1).max(200),
  eventType: z.enum(['notification', 'reconciliation']),
  userId: z.uuid(),
  subscriptionId: googleMockIdSchema,
});
export type GoogleMockJob = z.infer<typeof googleMockJobSchema>;

export const expirationJobSchema = baseJobSchema.extend({
  provider: z.literal('local_expiration'),
  eventId: z.string().min(1).max(200),
  eventType: z.literal('expiration'),
  userId: z.uuid(),
});
export type ExpirationJob = z.infer<typeof expirationJobSchema>;

export const appleJobSchema = baseJobSchema.extend({
  provider: z.literal('apple'),
  environment: z.literal('Sandbox'),
  eventId: z.uuid(),
  eventType: z.enum(['client.sync', 'notification']),
  transactionId: z.string().regex(/^[0-9]{1,64}$/),
  userId: z.uuid(),
});
export type AppleJob = z.infer<typeof appleJobSchema>;

// Internal refresh jobs cannot enter through the client/notification schema.
export const appleReconciliationJobSchema = baseJobSchema.extend({
  provider: z.literal('apple'),
  environment: z.literal('Sandbox'),
  eventId: z.string().regex(/^reconcile_[0-9a-f-]{36}_[0-9]{1,64}$/),
  eventType: z.literal('reconciliation'),
  transactionId: z.string().regex(/^[0-9]{1,64}$/),
  userId: z.uuid(),
});
export type AppleReconciliationJob = z.infer<
  typeof appleReconciliationJobSchema
>;
export type AppleProcessingJob = AppleJob | AppleReconciliationJob;

export const googleJobSchema = baseJobSchema
  .extend({
    provider: z.literal('google'),
    environment: z.literal('test'),
    eventId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
    eventType: z.enum(['client.sync', 'notification', 'reconciliation']),
    packageName: z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
    purchaseToken: z.string().min(1).max(4096).regex(/^\S+$/),
    // Notifications resolve ownership from a fresh Google API response.
    userId: z.uuid().optional(),
  })
  .superRefine((job, context) => {
    if (job.eventType !== 'notification' && !job.userId) {
      context.addIssue({
        code: 'custom',
        message: 'Internal user is required.',
      });
    }
  });
export type GoogleJob = z.infer<typeof googleJobSchema>;

export const subscriptionJobSchema = z.union([
  jobSchema,
  stripeReconciliationJobSchema,
  appleJobSchema,
  appleReconciliationJobSchema,
  googleJobSchema,
  googleMockJobSchema,
  expirationJobSchema,
]);
export type SubscriptionJob = z.infer<typeof subscriptionJobSchema>;

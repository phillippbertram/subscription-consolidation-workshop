import { z } from 'zod';

export const userProfileSchema = z.object({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export const scoreHistorySchema = z.object({
  synthetic: z.literal(true),
  points: z.array(
    z.object({ date: z.iso.date(), score: z.number().min(0).max(100) }),
  ),
});
// Clients can still display a safe error if an upstream response omits metadata.
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), requestId: z.string().optional() }),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type ScoreHistory = z.infer<typeof scoreHistorySchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

const providerSchema = z.enum([
  'stripe',
  'apple',
  'google',
  'apple_mock',
  'google_mock',
]);

// HTTP representation only; persistence schemas and access rules stay in domain.
export const subscriptionSchema = z.object({
  userId: z.uuid(),
  provider: providerSchema,
  providerSubscriptionId: z.string().min(1),
  productId: z.string().min(1),
  state: z.string().min(1),
  providerStatus: z.string().min(1),
  cancelAtPeriodEnd: z.boolean(),
  accessUntil: z.iso.datetime().nullable(),
  graceUntil: z.iso.datetime().nullable(),
  verifiedAt: z.iso.datetime(),
  revision: z.number().int().positive(),
});

export const entitlementsSchema = z.object({
  tier: z.enum(['free', 'premium']),
  features: z.array(z.literal('score_history')),
  effectiveUntil: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime(),
  grants: z.array(
    z.discriminatedUnion('source', [
      z.object({
        source: z.literal('provider'),
        provider: providerSchema,
        providerSubscriptionId: z.string(),
        revision: z.number().int().positive(),
        validUntil: z.iso.datetime(),
      }),
      z.object({
        source: z.literal('admin'),
        grantId: z.literal('premium'),
        revision: z.number().int().positive(),
        validUntil: z.iso.datetime().nullable(),
      }),
    ]),
  ),
  warnings: z.array(
    z.object({
      provider: z.string(),
      providerSubscriptionId: z.string(),
      reason: z.string(),
    }),
  ),
});

export const subscriptionOverviewSchema = z.object({
  subscriptions: z.array(subscriptionSchema),
  entitlements: entitlementsSchema,
});

export type Subscription = z.infer<typeof subscriptionSchema>;
export type Entitlements = z.infer<typeof entitlementsSchema>;
export type SubscriptionOverview = z.infer<typeof subscriptionOverviewSchema>;

// Shared client presentation rules, so Web and Mobile offer purchases alike.
// They only decide what to show: the API enforces the same blocks on checkout.
const blockingStates = ['pending', 'past_due', 'paused'];

/** An unfinished, unpaid, or paused Premium subscription must be resolved first. */
export function hasBlockingSubscription(overview: SubscriptionOverview) {
  return overview.subscriptions.some(
    (subscription) =>
      (subscription.productId === 'premium_monthly' ||
        (subscription.provider === 'stripe' &&
          subscription.productId === 'premium_daily')) &&
      blockingStates.includes(subscription.state),
  );
}

/** Offer a purchase only to Free users without warnings or blocking records. */
export function canPurchasePremium(overview: SubscriptionOverview) {
  return (
    overview.entitlements.tier === 'free' &&
    overview.entitlements.warnings.length === 0 &&
    !hasBlockingSubscription(overview)
  );
}

// Billing choices share Premium access; only Stripe currently offers daily billing.
export const stripePlanIdSchema = z.enum(['premium_daily', 'premium_monthly']);
export type StripePlanId = z.infer<typeof stripePlanIdSchema>;

export const checkoutRequestIdSchema = z.uuid();
export const checkoutRequestSchema = z
  .object({
    planId: stripePlanIdSchema,
  })
  .strict();
export const checkoutSessionSchema = z.object({
  sessionId: z.string().startsWith('cs_test_'),
  url: z
    .url()
    .refine((value) => new URL(value).origin === 'https://checkout.stripe.com'),
  expiresAt: z.iso.datetime(),
});
export const cancellationRequestSchema = z
  .object({
    subscriptionId: z
      .string()
      .regex(/^sub_[A-Za-z0-9]+$/)
      .max(255),
  })
  .strict();
export const cancellationResultSchema = z.object({
  status: z.enum(['scheduled', 'ended']),
});

export const appleConfigSchema = z.object({
  productId: z.string(),
  appAccountToken: z.uuid(),
  environment: z.literal('Sandbox'),
});
export const appleSyncRequestSchema = z
  .object({
    transactionId: z.string().regex(/^[0-9]{1,64}$/),
  })
  .strict();
export const appleOperationIdSchema = z.uuid();
export const appleSyncOperationSchema = z.object({
  operationId: appleOperationIdSchema,
  status: z.literal('pending'),
});
export const appleSyncStatusSchema = z.object({
  status: z.enum(['pending', 'completed']),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;
export type CancellationRequest = z.infer<typeof cancellationRequestSchema>;
export type CancellationResult = z.infer<typeof cancellationResultSchema>;
export type AppleConfig = z.infer<typeof appleConfigSchema>;
export type AppleSyncRequest = z.infer<typeof appleSyncRequestSchema>;
export type AppleSyncOperation = z.infer<typeof appleSyncOperationSchema>;
export type AppleSyncStatus = z.infer<typeof appleSyncStatusSchema>;

export const googleConfigSchema = z.object({
  packageName: z.string(),
  productId: z.string(),
  basePlanId: z.string(),
  obfuscatedAccountId: z.uuid(),
  environment: z.literal('test'),
});
export const googleSyncRequestSchema = z.strictObject({
  purchaseToken: z.string().min(1).max(4096).regex(/^\S+$/),
});
export const googleOperationIdSchema = z.uuid();
export const googleSyncOperationSchema = z.object({
  operationId: googleOperationIdSchema,
  status: z.literal('pending'),
});
export const googleSyncStatusSchema = z.object({
  status: z.enum(['pending', 'completed']),
});
export type GoogleConfig = z.infer<typeof googleConfigSchema>;
export type GoogleSyncRequest = z.infer<typeof googleSyncRequestSchema>;
export type GoogleSyncOperation = z.infer<typeof googleSyncOperationSchema>;
export type GoogleSyncStatus = z.infer<typeof googleSyncStatusSchema>;

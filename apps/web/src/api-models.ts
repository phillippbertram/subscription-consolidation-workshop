import { z } from 'zod';

export const profileSchema = z.object({
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
});
const providerSchema = z.enum(['stripe', 'apple', 'apple_mock', 'google_mock']);
export const subscriptionsSchema = z.object({
  subscriptions: z.array(
    z.object({
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
    }),
  ),
});
export const entitlementsSchema = z.object({
  tier: z.enum(['free', 'premium']),
  features: z.array(z.literal('score_history')),
  effectiveUntil: z.iso.datetime().nullable(),
  evaluatedAt: z.iso.datetime(),
  grants: z.array(
    z.object({
      provider: providerSchema,
      providerSubscriptionId: z.string(),
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
});
export type Profile = z.infer<typeof profileSchema>;
export type Subscription = z.infer<
  typeof subscriptionsSchema
>['subscriptions'][number];
export type Entitlements = z.infer<typeof entitlementsSchema>;

import { z } from 'zod';

export const subscriptionSchema = z.object({
  userId: z.uuid(),
  provider: z.enum(['stripe', 'apple_mock', 'google_mock']),
  providerSubscriptionId: z.string().min(1),
  // Unknown products/statuses stay visible but never grant access.
  productId: z.string().min(1),
  state: z.string().min(1),
  providerStatus: z.string().min(1),
  cancelAtPeriodEnd: z.boolean(),
  accessUntil: z.iso.datetime().nullable(),
  graceUntil: z.iso.datetime().nullable(),
  verifiedAt: z.iso.datetime(),
  revision: z.number().int().positive(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;
export type Provider = Subscription['provider'];
export type SubscriptionState =
  | 'pending'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'revoked';

export function normalizeProviderStatus(
  provider: Provider,
  status: string,
): SubscriptionState | null {
  if (provider === 'stripe') {
    switch (status) {
      case 'incomplete':
        return 'pending';
      case 'incomplete_expired':
      case 'unpaid':
        return 'expired';
      case 'trialing':
      case 'active':
      case 'past_due':
      case 'paused':
      case 'canceled':
        return status;
      default:
        return null;
    }
  }
  // The demo store adapters use the normalized vocabulary, not real store codes.
  switch (status) {
    case 'pending':
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'paused':
    case 'canceled':
    case 'expired':
    case 'revoked':
      return status;
    default:
      return null;
  }
}

export const GRACE_MS = 24 * 60 * 60 * 1000;

export function deriveEntitlements(
  subscriptions: readonly Subscription[],
  now: Date,
) {
  const evaluatedAt = now.toISOString();
  const grants: {
    provider: Provider;
    providerSubscriptionId: string;
    revision: number;
    validUntil: string;
  }[] = [];
  const warnings: {
    provider: Provider;
    providerSubscriptionId: string;
    reason: string;
  }[] = [];
  for (const subscription of subscriptions) {
    const { provider, providerSubscriptionId, state, accessUntil } =
      subscription;
    if (
      subscription.productId !== 'premium_monthly' ||
      normalizeProviderStatus(provider, subscription.providerStatus) !== state
    ) {
      warnings.push({
        provider,
        providerSubscriptionId,
        reason: 'Unknown product or inconsistent provider state',
      });
      continue;
    }
    // accessUntil is a previously verified grant, never an unpaid billing period.
    if (!accessUntil) continue;
    const accessEnd = Date.parse(accessUntil);
    let validUntil = accessEnd;
    if (state === 'past_due') {
      // The persisted boundary may shorten grace, but can never extend it.
      const graceEnd = subscription.graceUntil
        ? Date.parse(subscription.graceUntil)
        : accessEnd;
      validUntil = Math.max(
        accessEnd,
        Math.min(graceEnd, accessEnd + GRACE_MS),
      );
    } else if (state !== 'active' && state !== 'trialing') {
      continue;
    }
    if (Number.isFinite(validUntil) && now.getTime() < validUntil) {
      grants.push({
        provider,
        providerSubscriptionId,
        revision: subscription.revision,
        validUntil: new Date(validUntil).toISOString(),
      });
    }
  }
  grants.sort(
    (a, b) =>
      a.validUntil.localeCompare(b.validUntil) ||
      a.providerSubscriptionId.localeCompare(b.providerSubscriptionId),
  );
  return {
    tier: grants.length ? ('premium' as const) : ('free' as const),
    features: grants.length ? ['score_history' as const] : [],
    // Re-evaluate at the first boundary, even if another provider still grants access.
    effectiveUntil: grants[0]?.validUntil ?? null,
    evaluatedAt,
    grants,
    warnings,
  };
}

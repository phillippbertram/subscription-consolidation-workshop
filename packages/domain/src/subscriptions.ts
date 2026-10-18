import { z } from 'zod';
import { hasAdminAccess, type AdminGrant } from './admin-grants.js';

export const subscriptionSchema = z.object({
  userId: z.uuid(),
  provider: z.enum(['stripe', 'apple', 'google', 'apple_mock', 'google_mock']),
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

  if (provider === 'apple') {
    switch (status) {
      case '1':
        return 'active';
      case '2':
        return 'expired';
      case '3':
      case '4':
        return 'past_due';
      case '5':
        return 'revoked';
      default:
        return null;
    }
  }

  if (provider === 'google') {
    switch (status) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
      case 'SUBSCRIPTION_STATE_CANCELED':
        // A canceled auto-renewing purchase keeps its verified access boundary.
        return 'active';
      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        return 'past_due';
      case 'SUBSCRIPTION_STATE_PENDING':
        return 'pending';
      case 'SUBSCRIPTION_STATE_ON_HOLD':
      case 'SUBSCRIPTION_STATE_PAUSED':
        return 'paused';
      case 'SUBSCRIPTION_STATE_EXPIRED':
      case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
        return 'expired';
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

type AccessGrant =
  | {
      source: 'provider';
      provider: Provider;
      providerSubscriptionId: string;
      revision: number;
      validUntil: string;
    }
  | {
      source: 'admin';
      grantId: 'premium';
      revision: number;
      validUntil: string | null;
    };

/**
 * Combine verified provider records and complimentary access at one point in time.
 * The injected time keeps API reads and background workers on the same policy;
 * callers need no provider request to enforce an already-known expiration.
 */
export function deriveEntitlements(
  subscriptions: readonly Subscription[],
  now: Date,
  adminGrant: AdminGrant | null = null,
) {
  // Recompute the union of valid grants instead of toggling one user-wide flag.
  // A canceled subscription must not erase access from another valid provider.
  const evaluatedAt = now.toISOString();
  const grants: AccessGrant[] = [];
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
    if (!accessUntil) {
      continue;
    }

    const accessEnd = Date.parse(accessUntil);
    let validUntil = accessEnd;
    if (state === 'past_due') {
      // Apple supplies a verified grace boundary; synthetic/Stripe grace is capped.
      const graceEnd = subscription.graceUntil
        ? Date.parse(subscription.graceUntil)
        : accessEnd;
      validUntil = Math.max(
        accessEnd,
        provider === 'apple'
          ? graceEnd
          : Math.min(graceEnd, accessEnd + GRACE_MS),
      );
    } else if (state !== 'active' && state !== 'trialing') {
      continue;
    }

    if (Number.isFinite(validUntil) && now.getTime() < validUntil) {
      grants.push({
        source: 'provider',
        provider,
        providerSubscriptionId,
        revision: subscription.revision,
        validUntil: new Date(validUntil).toISOString(),
      });
    }
  }

  if (adminGrant && hasAdminAccess(adminGrant, now)) {
    grants.push({
      source: 'admin',
      grantId: adminGrant.grantId,
      revision: adminGrant.revision,
      validUntil: adminGrant.expiresAt,
    });
  }

  // Unbounded access has no timer. Still schedule the earliest finite boundary
  // so a provider expiry is published even while complimentary access survives.
  grants.sort((a, b) => {
    if (a.validUntil === null) {
      return b.validUntil === null ? 0 : 1;
    }

    if (b.validUntil === null) {
      return -1;
    }

    const aKey =
      a.source === 'provider'
        ? `${a.provider}:${a.providerSubscriptionId}`
        : a.grantId;
    const bKey =
      b.source === 'provider'
        ? `${b.provider}:${b.providerSubscriptionId}`
        : b.grantId;
    return (
      Date.parse(a.validUntil) - Date.parse(b.validUntil) ||
      aKey.localeCompare(bKey)
    );
  });
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

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

/**
 * Translate one provider's status vocabulary into our shared states.
 * This is the heart of consolidation: after this step, access rules no longer
 * care where the user paid. Unknown values return null and grant nothing.
 */
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
    // App Store Server API subscription status codes.
    switch (status) {
      case '1': // Active
        return 'active';
      case '2': // Expired
        return 'expired';
      case '3': // Billing retry: renewal failed, Apple keeps trying
      case '4': // Billing grace period: renewal failed, access continues
        return 'past_due';
      case '5': // Revoked, e.g. refunded
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

/** Maximum grace after a failed renewal for providers without a signed grace boundary. */
export const GRACE_MS = 24 * 60 * 60 * 1000;

const PREMIUM_PRODUCT_ID = 'premium_monthly';

/** One reason why a user has Premium right now, with the moment it ends. */
export type AccessGrant =
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
      /** null means unbounded complimentary access. */
      validUntil: string | null;
    };

export interface EntitlementWarning {
  provider: Provider;
  providerSubscriptionId: string;
  reason: string;
}

/** The combined answer to "is this user Premium right now, and why?" */
export interface Entitlements {
  tier: 'free' | 'premium';
  features: 'score_history'[];
  /** Earliest end of any grant: the next moment access must be re-evaluated. */
  effectiveUntil: string | null;
  evaluatedAt: string;
  grants: AccessGrant[];
  warnings: EntitlementWarning[];
}

/**
 * Combine verified provider records and complimentary access at one point in time.
 * The injected time keeps API reads and background workers on the same policy;
 * callers need no provider request to enforce an already-known expiration.
 */
export function deriveEntitlements(
  subscriptions: readonly Subscription[],
  now: Date,
  adminGrant: AdminGrant | null = null,
): Entitlements {
  // Recompute the union of valid grants instead of toggling one user-wide flag.
  // A canceled subscription must not erase access from another valid provider.
  const grants: AccessGrant[] = [];
  const warnings: EntitlementWarning[] = [];

  // Step 1: every provider record that is valid right now becomes a grant.
  for (const subscription of subscriptions) {
    const { provider, providerSubscriptionId } = subscription;
    if (!isKnownAndConsistent(subscription)) {
      warnings.push({
        provider,
        providerSubscriptionId,
        reason: 'Unknown product or inconsistent provider state',
      });
      continue;
    }

    const accessEnd = accessEndFor(subscription);
    if (accessEnd !== null && now.getTime() < accessEnd) {
      grants.push({
        source: 'provider',
        provider,
        providerSubscriptionId,
        revision: subscription.revision,
        validUntil: new Date(accessEnd).toISOString(),
      });
    }
  }

  // Step 2: complimentary access is an independent grant next to purchases.
  if (adminGrant && hasAdminAccess(adminGrant, now)) {
    grants.push({
      source: 'admin',
      grantId: adminGrant.grantId,
      revision: adminGrant.revision,
      validUntil: adminGrant.expiresAt,
    });
  }

  // Step 3: earliest end first. Even while unbounded complimentary access
  // survives, a provider expiry is still the next boundary worth publishing.
  grants.sort(compareGrants);

  const premium = grants.length > 0;
  return {
    tier: premium ? 'premium' : 'free',
    features: premium ? ['score_history'] : [],
    effectiveUntil: grants[0]?.validUntil ?? null,
    evaluatedAt: now.toISOString(),
    grants,
    warnings,
  };
}

/**
 * Only the Premium product grants access, and only if the stored state still
 * matches what its provider status translates to. Anything else is suspicious
 * data: keep it visible as a warning, but never let it grant access.
 */
function isKnownAndConsistent(subscription: Subscription) {
  return (
    subscription.productId === PREMIUM_PRODUCT_ID &&
    normalizeProviderStatus(
      subscription.provider,
      subscription.providerStatus,
    ) === subscription.state
  );
}

/**
 * End of access for one subscription in milliseconds, or null when its state
 * grants nothing. accessUntil is a previously verified paid boundary, never an
 * unpaid billing period.
 */
function accessEndFor(subscription: Subscription): number | null {
  const { provider, state, accessUntil, graceUntil } = subscription;
  if (!accessUntil) {
    return null;
  }

  const paidUntil = Date.parse(accessUntil);
  if (!Number.isFinite(paidUntil)) {
    return null;
  }

  if (state === 'active' || state === 'trialing') {
    return paidUntil;
  }

  if (state !== 'past_due') {
    return null;
  }

  // A failed renewal keeps access for a short grace period. Apple signs its own
  // grace boundary; for other providers the stored value is capped at GRACE_MS.
  const graceEnd = graceUntil ? Date.parse(graceUntil) : paidUntil;
  const allowedGraceEnd =
    provider === 'apple' ? graceEnd : Math.min(graceEnd, paidUntil + GRACE_MS);
  const accessEnd = Math.max(paidUntil, allowedGraceEnd);
  return Number.isFinite(accessEnd) ? accessEnd : null;
}

/** Earliest finite end first, unbounded grants last, ties in a stable order. */
function compareGrants(a: AccessGrant, b: AccessGrant) {
  if (a.validUntil === null) {
    return b.validUntil === null ? 0 : 1;
  }

  if (b.validUntil === null) {
    return -1;
  }

  return (
    Date.parse(a.validUntil) - Date.parse(b.validUntil) ||
    grantKey(a).localeCompare(grantKey(b))
  );
}

function grantKey(grant: AccessGrant) {
  return grant.source === 'provider'
    ? `${grant.provider}:${grant.providerSubscriptionId}`
    : grant.grantId;
}

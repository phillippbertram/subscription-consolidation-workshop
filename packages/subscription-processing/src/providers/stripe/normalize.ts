import {
  GRACE_MS,
  isPremiumSubscription,
  normalizeProviderStatus,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';
import type { StripeSnapshot } from './contracts.js';
import { sameDomainState } from '../../processing/subscription-state.js';

// Provider I/O lives outside this pure domain mapping. A status alone never
// establishes a paid grant; even grace is anchored to a verified paid period.
export function normalizeStripeSubscription(
  userId: string,
  snapshot: StripeSnapshot,
  previous: Subscription | undefined,
  now: Date,
): Subscription {
  const state =
    normalizeProviderStatus('stripe', snapshot.status) ?? snapshot.status;
  const mapped = isPremiumSubscription({
    provider: 'stripe',
    productId: snapshot.productId,
  });
  const accessUntil = mapped
    ? state === 'trialing'
      ? snapshot.trialUntil
      : snapshot.paidUntil
    : null;
  // Daily billing still uses the existing 24-hour failed-renewal grace policy.
  // Access comes from invoice boundaries, never by adding a day/month locally.
  const next = subscriptionSchema.parse({
    userId,
    provider: 'stripe',
    providerSubscriptionId: snapshot.providerSubscriptionId,
    productId: snapshot.productId,
    state,
    providerStatus: snapshot.status,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    accessUntil,
    // Anchor grace to the paid boundary, not processing time. Replayed or
    // delayed failure events must not restart a fresh 24-hour grace period.
    graceUntil:
      state === 'past_due' && accessUntil
        ? new Date(Date.parse(accessUntil) + GRACE_MS).toISOString()
        : null,
    verifiedAt: now.toISOString(),
    revision: (previous?.revision ?? 0) + 1,
  });
  if (previous && sameDomainState(previous, next)) {
    next.revision = previous.revision;
  }

  return next;
}

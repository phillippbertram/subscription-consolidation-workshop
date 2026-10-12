import {
  GRACE_MS,
  normalizeProviderStatus,
  subscriptionSchema,
  type Subscription,
} from '@premiumpass/domain';
import type { ProviderSnapshot } from './contracts.js';

export function sameDomainState(a: Subscription, b: Subscription) {
  // Verification time and revision are intentionally excluded: refreshing data
  // is not by itself a business change worth publishing through the outbox.
  const domain = (s: Subscription) => ({
    userId: s.userId,
    provider: s.provider,
    providerSubscriptionId: s.providerSubscriptionId,
    productId: s.productId,
    state: s.state,
    providerStatus: s.providerStatus,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    accessUntil: s.accessUntil,
    graceUntil: s.graceUntil,
  });
  return JSON.stringify(domain(a)) === JSON.stringify(domain(b));
}

// Provider I/O lives outside this pure domain mapping. A status alone never
// establishes a paid grant; even grace is anchored to a verified paid period.
export function normalizeSubscription(
  userId: string,
  snapshot: ProviderSnapshot,
  previous: Subscription | undefined,
  now: Date,
): Subscription {
  const state =
    normalizeProviderStatus('stripe', snapshot.status) ?? snapshot.status;
  const mapped = snapshot.productId === 'premium_monthly';
  const accessUntil = mapped
    ? state === 'trialing'
      ? snapshot.trialUntil
      : snapshot.paidUntil
    : null;
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
  if (previous && sameDomainState(previous, next))
    next.revision = previous.revision;
  return next;
}

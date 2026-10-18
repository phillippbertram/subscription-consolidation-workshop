import type { Subscription } from '@premiumpass/domain';
import { expirationDue, type Aggregate } from './contracts.js';

/** Verification time and revision alone do not justify a domain event. */
export function sameDomainState(previous: Subscription, current: Subscription) {
  return (
    previous.userId === current.userId &&
    previous.provider === current.provider &&
    previous.providerSubscriptionId === current.providerSubscriptionId &&
    previous.productId === current.productId &&
    previous.state === current.state &&
    previous.providerStatus === current.providerStatus &&
    previous.cancelAtPeriodEnd === current.cancelAtPeriodEnd &&
    previous.accessUntil === current.accessUntil &&
    previous.graceUntil === current.graceUntil
  );
}

/** Publish source changes and due access boundaries through the same outbox path. */
export function hasSubscriptionChanged(
  aggregate: Aggregate,
  subscription: Subscription,
  now: Date,
) {
  const previous = aggregate.subscriptions.find(
    (candidate) =>
      candidate.provider === subscription.provider &&
      candidate.providerSubscriptionId === subscription.providerSubscriptionId,
  );
  return (
    !previous ||
    !sameDomainState(previous, subscription) ||
    expirationDue(aggregate, now)
  );
}

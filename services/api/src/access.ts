import {
  deriveEntitlements,
  type SubscriptionStore,
} from '@premiumpass/domain';

/**
 * Read every access source of one user and evaluate it at the current time.
 *
 * The stored entitlement snapshot is deliberately not used here: it may be
 * outdated if a subscription expired without a webhook. Recomputing from the
 * records on every request enforces each boundary exactly when it passes.
 */
export async function loadCurrentAccess(
  store: SubscriptionStore,
  userId: string,
  now: () => Date,
) {
  const [subscriptions, adminGrant] = await Promise.all([
    store.listForUser(userId),
    store.getAdminGrant(userId),
  ]);

  // Sample time after the reads, so a slow read cannot extend access.
  const entitlements = deriveEntitlements(subscriptions, now(), adminGrant);
  return { subscriptions, entitlements };
}

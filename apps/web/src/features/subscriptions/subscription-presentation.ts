import type {
  Entitlements,
  Subscription,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { hasBlockingSubscription } from '@premiumpass/api-contracts';

export const providerNames = {
  stripe: 'Website',
  apple: 'App Store',
  google: 'Google Play',
  apple_mock: 'Apple demo',
  google_mock: 'Google demo',
};

/** Show billing frequency without implying that the feature set changes. */
export function planName(productId: string) {
  if (productId === 'premium_daily') {
    return 'Premium Daily';
  }

  if (productId === 'premium_monthly') {
    return 'Premium Monthly';
  }

  return productId;
}

export type Tone = 'success' | 'warning' | 'destructive' | 'secondary';
type Grant = Entitlements['grants'][number];

export function findGrant(
  subscription: Subscription,
  entitlements: Entitlements,
) {
  return entitlements.grants.find(
    (grant) =>
      grant.source === 'provider' &&
      grant.provider === subscription.provider &&
      grant.providerSubscriptionId === subscription.providerSubscriptionId,
  );
}

export function findSubscription(grant: Grant, subscriptions: Subscription[]) {
  if (grant.source === 'admin') {
    return undefined;
  }

  return subscriptions.find(
    (subscription) =>
      subscription.provider === grant.provider &&
      subscription.providerSubscriptionId === grant.providerSubscriptionId,
  );
}

/**
 * One badge per subscription record, matching the mobile app's wording. A
 * current grant decides whether a record provides access; the provider state
 * only explains why. Records without a grant never read as active.
 */
export function describeSubscription(
  subscription: Subscription,
  entitlements: Entitlements,
): { hasAccess: boolean; label: string; tone: Tone } {
  const hasAccess = findGrant(subscription, entitlements) !== undefined;
  const hasWarning = entitlements.warnings.some(
    (warning) =>
      warning.provider === subscription.provider &&
      warning.providerSubscriptionId === subscription.providerSubscriptionId,
  );
  if (hasWarning) {
    return { hasAccess, label: 'Check status', tone: 'warning' };
  }

  if (hasAccess) {
    if (subscription.state === 'past_due') {
      return { hasAccess: true, label: 'Payment issue', tone: 'warning' };
    }

    if (subscription.cancelAtPeriodEnd) {
      return { hasAccess: true, label: 'Ending', tone: 'warning' };
    }

    if (subscription.state === 'trialing') {
      return { hasAccess: true, label: 'Trial', tone: 'success' };
    }

    return { hasAccess: true, label: 'Active', tone: 'success' };
  }

  const labels: Record<string, [string, Tone]> = {
    pending: ['Pending', 'warning'],
    past_due: ['Payment issue', 'destructive'],
    paused: ['Paused', 'warning'],
    canceled: ['Canceled', 'secondary'],
    expired: ['Expired', 'secondary'],
    revoked: ['Revoked', 'secondary'],
    // Still "active" at the provider, but the verified period is over.
    active: ['Expired', 'secondary'],
    trialing: ['Expired', 'secondary'],
  };
  const [label, tone] = labels[subscription.state] ?? [
    'Check status',
    'warning',
  ];
  return { hasAccess: false, label, tone };
}

/**
 * The membership headline for the overview and billing pages. Premium is the
 * union of all valid grants, so it only reads "Ending" when no grant renews.
 */
export function describeMembership(
  overview: SubscriptionOverview,
  confirmedCancellations: string[] = [],
): { label: string; tone: Tone; needsAttention: boolean } {
  const needsAttention =
    overview.entitlements.warnings.length > 0 ||
    hasBlockingSubscription(overview);
  if (overview.entitlements.tier === 'free') {
    return needsAttention
      ? { label: 'Needs attention', tone: 'warning', needsAttention }
      : { label: 'Free plan', tone: 'secondary', needsAttention };
  }

  const everyGrantEnds = overview.entitlements.grants.every((grant) => {
    const subscription = findSubscription(grant, overview.subscriptions);
    return (
      subscription !== undefined &&
      (subscription.cancelAtPeriodEnd ||
        confirmedCancellations.includes(subscription.providerSubscriptionId))
    );
  });
  return everyGrantEnds
    ? { label: 'Ending', tone: 'warning', needsAttention }
    : { label: 'Active', tone: 'success', needsAttention };
}

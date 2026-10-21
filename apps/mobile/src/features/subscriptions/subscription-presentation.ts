import type {
  Entitlements,
  Subscription,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';
import { hasBlockingSubscription } from '@premiumpass/api-contracts';
import type { Tone } from '../../components/Brand';

export { canPurchasePremium } from '@premiumpass/api-contracts';

export const providerLabels: Record<Subscription['provider'], string> = {
  apple: 'App Store',
  google: 'Google Play',
  stripe: 'Website',
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

/** Same colors as the website: green grants access, amber needs a look. */
export function badgeTone(badge: string): Tone {
  if (badge === 'Active' || badge === 'Trial') {
    return 'success';
  }

  if (['Canceled', 'Expired', 'Revoked'].includes(badge)) {
    return 'secondary';
  }

  return 'warning';
}

type Grant = Entitlements['grants'][number];

export function findGrantSubscription(
  grant: Grant,
  overview: SubscriptionOverview,
) {
  if (grant.source === 'admin') {
    return undefined;
  }

  return overview.subscriptions.find(
    (subscription) =>
      subscription.provider === grant.provider &&
      subscription.providerSubscriptionId === grant.providerSubscriptionId,
  );
}

/**
 * The membership headline. Premium is the union of all valid grants, so it
 * only reads "Ending" when no grant renews any more.
 */
export function describeMembership(overview: SubscriptionOverview): {
  label: string;
  tone: Tone;
  headline: string;
  needsAttention: boolean;
} {
  const { entitlements } = overview;
  const needsAttention =
    entitlements.warnings.length > 0 || hasBlockingSubscription(overview);
  if (entitlements.tier === 'free') {
    return {
      label: needsAttention ? 'Needs attention' : 'Free plan',
      tone: needsAttention ? 'warning' : 'secondary',
      headline:
        'You are on the Free plan. Premium unlocks your score history on every device.',
      needsAttention,
    };
  }

  const everyGrantEnds = entitlements.grants.every(
    (grant) => findGrantSubscription(grant, overview)?.cancelAtPeriodEnd,
  );
  return {
    label: everyGrantEnds ? 'Ending' : 'Active',
    tone: everyGrantEnds ? 'warning' : 'success',
    headline: entitlements.effectiveUntil
      ? `Premium access until ${formatAccessDate(entitlements.effectiveUntil, entitlements.evaluatedAt)}.`
      : 'Premium access until revoked.',
    needsAttention,
  };
}

export function describeSubscription(
  subscription: Subscription,
  overview: SubscriptionOverview,
) {
  const grant = overview.entitlements.grants.find(
    (item) =>
      item.source === 'provider' &&
      item.provider === subscription.provider &&
      item.providerSubscriptionId === subscription.providerSubscriptionId,
  );
  let status: string;
  let badge: string;
  if (grant) {
    if (subscription.state === 'past_due') {
      status = 'Payment issue · Access remains available';
      badge = 'Payment issue';
    } else if (subscription.cancelAtPeriodEnd) {
      status = 'Canceled · Active until the end of the paid period';
      badge = 'Ending';
    } else if (subscription.state === 'trialing') {
      status = 'Trial active';
      badge = 'Trial';
    } else {
      status = 'Active';
      badge = 'Active';
    }
  } else {
    const states: Record<string, string> = {
      pending: 'Payment pending',
      past_due: 'Payment issue · Access ended',
      paused: 'Paused',
      canceled: 'Canceled',
      expired: 'Expired',
      revoked: 'Revoked',
      active: 'Access period ended',
      trialing: 'Trial ended',
    };
    status = states[subscription.state] ?? 'Status unavailable';
    const badges: Record<string, string> = {
      pending: 'Pending',
      past_due: 'Payment issue',
      paused: 'Paused',
      canceled: 'Canceled',
      expired: 'Expired',
      revoked: 'Revoked',
      active: 'Expired',
      trialing: 'Expired',
    };
    badge = badges[subscription.state] ?? 'Check status';
    if (
      ['active', 'trialing'].includes(subscription.state) &&
      (!subscription.accessUntil ||
        Date.parse(subscription.accessUntil) >
          Date.parse(overview.entitlements.evaluatedAt))
    ) {
      status = 'Access not verified';
      badge = 'Check status';
    }
  }

  const warning = overview.entitlements.warnings.some(
    (item) =>
      item.provider === subscription.provider &&
      item.providerSubscriptionId === subscription.providerSubscriptionId,
  );
  if (warning) {
    status = 'Status unavailable';
    badge = 'Check status';
  }

  // A grant is the access boundary, including verified grace; it is not a bill date.
  const validUntil = grant?.validUntil ?? subscription.accessUntil;
  const boundaryLabel = grant
    ? 'Access until'
    : subscription.accessUntil &&
        Date.parse(subscription.accessUntil) <=
          Date.parse(overview.entitlements.evaluatedAt)
      ? 'Access ended on'
      : 'Last verified period ends';
  return {
    hasAccess: Boolean(grant),
    badge,
    provider: providerLabels[subscription.provider],
    status,
    validUntil,
    boundaryLabel,
    renewal: subscription.cancelAtPeriodEnd
      ? 'Disabled'
      : grant && ['active', 'trialing'].includes(subscription.state)
        ? 'Enabled'
        : null,
  };
}

export function formatAccessDate(value: string, evaluatedAt: string): string {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date(evaluatedAt).toDateString();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(sameDay ? ({ hour: 'numeric', minute: '2-digit' } as const) : {}),
  });
}

import type {
  Subscription,
  SubscriptionOverview,
} from '@premiumpass/api-contracts';

export { canPurchasePremium } from '@premiumpass/api-contracts';

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
  const providerLabels: Record<Subscription['provider'], string> = {
    apple: 'App Store',
    google: 'Google Play',
    stripe: 'Website',
    apple_mock: 'Apple demo',
    google_mock: 'Google demo',
  };
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

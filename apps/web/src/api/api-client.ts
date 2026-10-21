import type { z } from 'zod';
import {
  userProfileSchema,
  scoreHistorySchema,
  subscriptionOverviewSchema,
  entitlementsSchema,
  apiErrorSchema,
  checkoutSessionSchema,
  cancellationResultSchema,
  type CheckoutRequest,
  type StripePlanId,
  type CancellationRequest,
} from '@premiumpass/api-contracts';

const messages: Record<string, string> = {
  subscription_not_owned:
    'This subscription does not belong to your account. Refresh and try again.',
  cancellation_not_available:
    'This subscription cannot be canceled in its current state. Refresh its details and try again.',
  cancellation_unavailable:
    'Subscription cancellation is currently unavailable. Please try again later.',
  invalid_cancellation_request:
    'The cancellation request was invalid. Refresh and try again.',
  unauthorized: 'Your session is no longer valid. Sign out and sign in again.',
  verified_email_required:
    'Verify your email address with Auth0 before starting checkout, then sign in again and retry.',
  auth0_profile_unavailable:
    'Auth0 could not provide your profile. Please retry the same checkout attempt shortly.',
  auth0_profile_identity_mismatch:
    'Your Auth0 profile does not match this session. Sign out and sign in again.',
  checkout_unavailable:
    'Checkout is not configured. Add the Stripe test values to services/api/.env and restart the local API.',
  insufficient_scope:
    'Your token needs read:me, read:premium, and write:checkout, plus the openid and email scopes. Check Auth0 permissions and sign in again.',
  premium_required:
    'Your score history needs an active Premium membership. Refresh your account to check your access.',
  idempotency_conflict:
    'This attempt was created with different checkout settings. Restore those settings to recover it.',
  checkout_in_progress:
    'Another checkout attempt is still open. Resume it in its original browser tab or wait until Stripe reports it expired.',
  checkout_already_completed:
    'This checkout is already complete. Refresh your access status. If your previous Stripe subscription has ended, start a new attempt below.',
  subscription_already_exists:
    'Stripe still has a subscription that blocks another purchase. Changing local access does not cancel it. End the subscription in Stripe before buying again.',
  checkout_expired: 'This checkout has expired. You can start a new attempt.',
  checkout_recovery_required:
    'The previous Stripe outcome is unresolved. Inspect the stored request and Stripe before retrying; do not delete the purchase lock.',
  customer_recovery_required:
    'Customer creation needs manual recovery. Inspect Stripe and the local customer record before retrying.',
  stripe_price_invalid:
    'The configured price must be active, in test mode, and match the selected daily or monthly billing period. Check the Stripe setup guide.',
  stripe_unavailable:
    'Stripe could not complete the request. Check the backend configuration, then retry this same attempt.',
};
export class WebApiError extends Error {
  constructor(readonly code: string) {
    super(
      messages[code] ??
        'The request failed. Check the backend and your session, then retry.',
    );
  }
}
export class ApiClient {
  constructor(
    private readonly origin: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: RequestInit = {},
  ) {
    const token = await this.getToken();
    const response = await fetch(`${this.origin}${path}`, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new WebApiError(
        error.success ? error.data.error.code : 'request_failed',
      );
    }

    return schema.parse(body);
  }

  getProfile(signal?: AbortSignal) {
    return this.request('/v1/me', userProfileSchema, signal ? { signal } : {});
  }

  getSubscriptions(signal?: AbortSignal) {
    return this.request(
      '/v1/me/subscriptions',
      subscriptionOverviewSchema,
      signal ? { signal } : {},
    );
  }

  getEntitlements(signal?: AbortSignal) {
    return this.request(
      '/v1/me/entitlements',
      entitlementsSchema,
      signal ? { signal } : {},
    );
  }

  getScoreHistory(signal?: AbortSignal) {
    return this.request(
      '/v1/premium/score-history',
      scoreHistorySchema,
      signal ? { signal } : {},
    );
  }

  checkout(requestId: string, planId: StripePlanId) {
    return this.request(
      '/v1/billing/stripe/checkout-session',
      checkoutSessionSchema,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId,
        },
        body: JSON.stringify({
          planId,
        } satisfies CheckoutRequest),
      },
    );
  }

  cancelSubscription(subscriptionId: string) {
    return this.request(
      '/v1/billing/stripe/cancel-subscription',
      cancellationResultSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId } satisfies CancellationRequest),
      },
    );
  }
}

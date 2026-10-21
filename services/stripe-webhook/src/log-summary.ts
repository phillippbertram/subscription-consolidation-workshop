import type Stripe from 'stripe';
import { pickFields, pickTimes } from '@premiumpass/logging';

/**
 * What a workshop participant needs to see about an incoming Stripe event: the
 * event itself and the few fields of its object that explain the event.
 *
 * This is a deliberately small allowlist, not the payload. Stripe objects also
 * carry customer details, payment methods, and amounts, which never belong in
 * logs. The worker later reads the current state from Stripe anyway, so the
 * summary only has to explain why a job was queued.
 */
export function summarizeStripeEvent(event: Stripe.Event) {
  const object: unknown = event.data.object;

  return {
    providerEventId: event.id,
    eventType: event.type,
    apiVersion: event.api_version,
    created: new Date(event.created * 1000).toISOString(),
    livemode: event.livemode,
    object: {
      ...pickFields(object, [
        'id',
        'object',
        'status',
        'payment_status',
        'mode',
        'billing_reason',
        'cancel_at_period_end',
        'customer',
        'subscription',
        'client_reference_id',
      ]),
      ...pickTimes(object, ['current_period_end', 'cancel_at'], 'seconds'),
      priceLookupKeys: priceLookupKeys(event),
    },
  };
}

// The lookup key names the plan (for example premium_monthly), which is the
// first thing to check when access does not match the purchase.
function priceLookupKeys(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return event.data.object.items.data.flatMap(
        (item) => item.price.lookup_key ?? [],
      );
    default:
      return undefined;
  }
}

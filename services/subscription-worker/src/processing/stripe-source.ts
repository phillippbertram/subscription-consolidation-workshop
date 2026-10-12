import type { StripeJob } from '@premiumpass/billing-contracts';
import Stripe from 'stripe';
import { GRACE_MS } from '@premiumpass/domain';
import {
  ProcessingError,
  type ProviderSnapshot,
  type SubscriptionSource,
  type SubscriptionTarget,
} from './contracts.js';

function id(value: string | { id: string } | null | undefined) {
  // Stripe relationships may be IDs or expanded objects; compare identity
  // consistently without requiring a particular expansion setting.
  return typeof value === 'string' ? value : value?.id;
}

export class StripeSubscriptionSource implements SubscriptionSource {
  constructor(
    private readonly stripe: Stripe,
    private readonly priceId: string,
  ) {}

  async locate(job: StripeJob): Promise<SubscriptionTarget | null> {
    let customerId: string | undefined;
    let subscriptionId: string | undefined;
    if (job.eventType.startsWith('checkout.')) {
      const session = await this.stripe.checkout.sessions.retrieve(
        job.objectId,
      );
      if (
        session.livemode ||
        session.mode !== 'subscription' ||
        session.status !== 'complete'
      ) {
        throw new ProcessingError('invalid_checkout_reference');
      }
      customerId = id(session.customer);
      subscriptionId = id(session.subscription);
    } else if (job.eventType.startsWith('invoice.')) {
      const invoice = await this.stripe.invoices.retrieve(job.objectId);
      if (invoice.livemode) throw new ProcessingError('live_mode_rejected');
      customerId = id(invoice.customer);
      subscriptionId = id(invoice.parent?.subscription_details?.subscription);
      if (!subscriptionId) return null;
    } else {
      const subscription = await this.stripe.subscriptions.retrieve(
        job.objectId,
      );
      if (subscription.livemode)
        throw new ProcessingError('live_mode_rejected');
      customerId = id(subscription.customer);
      subscriptionId = subscription.id;
    }
    if (!customerId || !subscriptionId)
      throw new ProcessingError('subscription_reference_missing');
    return { customerId, subscriptionId };
  }

  async read(
    target: SubscriptionTarget,
    userId: string,
    now: Date,
  ): Promise<ProviderSnapshot> {
    const subscription = await this.stripe.subscriptions.retrieve(
      target.subscriptionId,
    );
    const customer = await this.stripe.customers.retrieve(target.customerId);
    if (
      subscription.livemode ||
      customer.deleted ||
      customer.livemode ||
      subscription.id !== target.subscriptionId ||
      customer.id !== target.customerId ||
      id(subscription.customer) !== target.customerId ||
      subscription.metadata.userId !== userId ||
      customer.metadata.userId !== userId
    ) {
      throw new ProcessingError('provider_owner_mismatch');
    }
    const item = subscription.items.data[0];
    // Metadata alone cannot turn an arbitrary price into Premium. Unknown
    // billing configurations remain visible but do not grant access.
    const mapped =
      !subscription.items.has_more &&
      subscription.items.data.length === 1 &&
      item?.price.id === this.priceId &&
      item.quantity === 1 &&
      !item.price.livemode &&
      item.price.recurring?.interval === 'month' &&
      item.price.recurring.interval_count === 1 &&
      item.price.recurring.usage_type === 'licensed' &&
      subscription.metadata.planId === 'premium_monthly';
    let paidEnd: number | null = null;
    if (
      mapped &&
      item &&
      ['active', 'past_due'].includes(subscription.status)
    ) {
      // Recent paid invoices recover a missed initial event and preserve the prior
      // paid boundary during a failed renewal. No unpaid billing period is a grant.
      const invoices = await this.stripe.invoices.list({
        customer: target.customerId,
        subscription: target.subscriptionId,
        status: 'paid',
        limit: 100,
      });
      for (const invoice of invoices.data) {
        if (
          invoice.livemode ||
          invoice.status !== 'paid' ||
          invoice.amount_remaining !== 0 ||
          id(invoice.customer) !== target.customerId ||
          id(invoice.parent?.subscription_details?.subscription) !==
            target.subscriptionId
        ) {
          throw new ProcessingError('invoice_reference_mismatch');
        }
        if (invoice.lines.has_more)
          throw new ProcessingError('invoice_line_limit_exceeded');
        // A zero-value trial invoice is not a prior paid grant for renewal grace.
        // Manual/out-of-band settlement is outside this card-only demo.
        if (
          invoice.amount_paid <= 0 ||
          (invoice.amount_paid_off_stripe ?? 0) > 0 ||
          invoice.collection_method !== 'charge_automatically'
        )
          continue;
        for (const line of invoice.lines.data) {
          // Paid invoices can contain adjustments or unrelated lines. Only the
          // matching recurring item proves the service period we can grant.
          const parent = line.parent?.subscription_item_details;
          if (
            !parent ||
            parent.proration ||
            parent.subscription !== target.subscriptionId ||
            parent.subscription_item !== item.id ||
            id(line.pricing?.price_details?.price) !== this.priceId ||
            line.quantity !== 1 ||
            line.amount <= 0
          )
            continue;
          // Reject future service periods and lines extending beyond the
          // current subscription item boundary before deriving paid access.
          const { start, end } = line.period;
          if (
            end <= start ||
            start > now.getTime() / 1000 ||
            end > item.current_period_end
          )
            continue;
          // Use an absolute verified boundary. Adding a month per event would
          // incorrectly multiply access when Stripe delivers duplicates.
          paidEnd = Math.max(paidEnd ?? 0, end);
        }
      }
      if (
        invoices.has_more &&
        (!paidEnd || paidEnd * 1000 + GRACE_MS <= now.getTime())
      ) {
        // This demo caps history reads. Never silently commit an incomplete scan.
        throw new ProcessingError('invoice_history_limit_exceeded');
      }
    }
    return {
      providerSubscriptionId: subscription.id,
      productId: mapped ? 'premium_monthly' : 'unmapped_product',
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      paidUntil: paidEnd ? new Date(paidEnd * 1000).toISOString() : null,
      trialUntil:
        mapped && subscription.trial_end && item
          ? new Date(
              Math.min(subscription.trial_end, item.current_period_end) * 1000,
            ).toISOString()
          : null,
    };
  }
}

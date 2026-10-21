import Stripe from 'stripe';
import { GRACE_MS } from '@premiumpass/domain';
import type {
  StripeSnapshot,
  StripeSource,
  StripeSubscriptionTarget,
  StripeProcessingJob,
} from './contracts.js';
import { ProcessingError } from '../../processing/contracts.js';

function stripeObjectId(value: string | { id: string } | null | undefined) {
  // Stripe relationships may be IDs or expanded objects; compare identity
  // consistently without requiring a particular expansion setting.
  return typeof value === 'string' ? value : value?.id;
}

export class StripeSubscriptionSource implements StripeSource {
  constructor(
    private readonly stripe: Stripe,
    private readonly productId: string,
  ) {}

  async locate(
    job: StripeProcessingJob,
  ): Promise<StripeSubscriptionTarget | null> {
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

      customerId = stripeObjectId(session.customer);
      subscriptionId = stripeObjectId(session.subscription);
    } else if (job.eventType.startsWith('invoice.')) {
      const invoice = await this.stripe.invoices.retrieve(job.objectId);
      if (invoice.livemode) {
        throw new ProcessingError('live_mode_rejected');
      }

      customerId = stripeObjectId(invoice.customer);
      subscriptionId = stripeObjectId(
        invoice.parent?.subscription_details?.subscription,
      );
      if (!subscriptionId) {
        return null;
      }
    } else {
      const subscription = await this.stripe.subscriptions.retrieve(
        job.objectId,
      );
      if (subscription.livemode) {
        throw new ProcessingError('live_mode_rejected');
      }

      customerId = stripeObjectId(subscription.customer);
      subscriptionId = subscription.id;
    }

    if (!customerId || !subscriptionId) {
      throw new ProcessingError('subscription_reference_missing');
    }

    return { customerId, subscriptionId };
  }

  async read(
    target: StripeSubscriptionTarget,
    userId: string,
    now: Date,
  ): Promise<StripeSnapshot> {
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
      stripeObjectId(subscription.customer) !== target.customerId ||
      subscription.metadata.userId !== userId ||
      customer.metadata.userId !== userId
    ) {
      throw new ProcessingError('provider_owner_mismatch');
    }

    const item = subscription.items.data[0];
    const planId = subscription.metadata.planId;
    const supportedPlan =
      planId === 'premium_daily' || planId === 'premium_monthly';
    const expectedInterval = planId === 'premium_daily' ? 'day' : 'month';
    // The configured product grants Premium across price generations. A lookup
    // key only selects new offers: old prices may lose that key or be archived
    // while their subscriptions keep renewing. Do not require an active price.
    // Metadata alone cannot grant access; ownership, product and supported
    // billing period must match before we examine paid service periods.
    const mapped =
      supportedPlan &&
      !subscription.items.has_more &&
      subscription.items.data.length === 1 &&
      stripeObjectId(item?.price.product) === this.productId &&
      item !== undefined &&
      item.quantity === 1 &&
      !item.price.livemode &&
      item.price.type === 'recurring' &&
      item.price.billing_scheme === 'per_unit' &&
      item.price.unit_amount !== null &&
      item.price.unit_amount > 0 &&
      item.price.recurring?.interval === expectedInterval &&
      item.price.recurring.interval_count === 1 &&
      item.price.recurring.usage_type === 'licensed';
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
          stripeObjectId(invoice.customer) !== target.customerId ||
          stripeObjectId(invoice.parent?.subscription_details?.subscription) !==
            target.subscriptionId
        ) {
          throw new ProcessingError('invoice_reference_mismatch');
        }

        if (invoice.lines.has_more) {
          throw new ProcessingError('invoice_line_limit_exceeded');
        }

        // A zero-value trial invoice is not a prior paid grant for renewal grace.
        // Manual/out-of-band settlement is outside this card-only demo.
        if (
          invoice.amount_paid <= 0 ||
          (invoice.amount_paid_off_stripe ?? 0) > 0 ||
          invoice.collection_method !== 'charge_automatically'
        ) {
          continue;
        }

        for (const line of invoice.lines.data) {
          // Paid invoices can contain adjustments or unrelated lines. Only the
          // matching recurring item and its actual price prove the service period
          // we can grant. Accepting every price of the product here would confuse
          // old adjustments with payment for the current item. Mid-cycle plan
          // changes/prorations need a separate policy and are outside this demo.
          const parent = line.parent?.subscription_item_details;
          if (
            !parent ||
            parent.proration ||
            parent.subscription !== target.subscriptionId ||
            parent.subscription_item !== item.id ||
            stripeObjectId(line.pricing?.price_details?.price) !==
              item.price.id ||
            line.quantity !== 1 ||
            line.amount <= 0
          ) {
            continue;
          }

          // A custom cancellation shortens the item period without rewriting
          // its paid invoice. Keep the covered portion, capped at the current
          // provider boundary; never grant a future or empty service period.
          const { start, end } = line.period;
          const coveredEnd = Math.min(
            end,
            item.current_period_end,
            subscription.cancel_at ?? Infinity,
          );
          if (
            end <= start ||
            start > now.getTime() / 1000 ||
            coveredEnd <= start
          ) {
            continue;
          }

          // Use an absolute verified boundary. Adding a month per event would
          // incorrectly multiply access when Stripe delivers duplicates.
          paidEnd = Math.max(paidEnd ?? 0, coveredEnd);
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
      productId: mapped ? planId : 'unmapped_product',
      status: subscription.status,
      // Stripe leaves its boolean false for a custom cancel_at even when that
      // date is now the item period end. Normalize both as an ending period.
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end ||
        Boolean(
          subscription.cancel_at &&
          item &&
          subscription.cancel_at <= item.current_period_end,
        ),
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

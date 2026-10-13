import Stripe from 'stripe';
import {
  CheckoutError,
  type BillingProvider,
  type CheckoutAttempt,
  type CheckoutSession,
  type CustomerMapping,
} from './contracts.js';

export class StripeBillingProvider implements BillingProvider {
  private readonly stripe: Stripe;
  /** Configure bounded SDK requests; no provider request runs during construction. */
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      maxNetworkRetries: 1,
      timeout: 10_000,
    });
  }
  /**
   * Run a provider operation, preserving application errors while replacing
   * other failures with a safe 503 error that contains no Stripe payload.
   */
  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CheckoutError) throw error;
      // Stripe errors can contain customer/payment payloads. Do not propagate
      // them to HTTP debug logs or attach them as an error cause.
      throw new CheckoutError('stripe_unavailable', 503);
    }
  }
  async validatePrice(priceId: string) {
    const price = await this.call(() =>
      this.stripe.prices.retrieve(priceId, { expand: ['product'] }),
    );
    const product = price.product;
    if (
      price.livemode ||
      !price.active ||
      price.type !== 'recurring' ||
      price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== 'licensed' ||
      price.billing_scheme !== 'per_unit' ||
      !price.unit_amount ||
      typeof product === 'string' ||
      product.deleted ||
      !product.active
    ) {
      throw new CheckoutError('stripe_price_invalid', 503);
    }
  }
  async createCustomer(mapping: CustomerMapping) {
    const customer = await this.call(() =>
      this.stripe.customers.create(
        { metadata: { userId: mapping.userId } },
        { idempotencyKey: `premiumpass-customer-${mapping.requestId}` },
      ),
    );
    if (customer.livemode)
      throw new CheckoutError('stripe_test_mode_required', 503);
    return customer.id;
  }
  async syncCustomerEmail(
    customerId: string,
    userId: string,
    verifiedEmail: string,
  ) {
    const customer = await this.call(() =>
      this.stripe.customers.retrieve(customerId),
    );
    if (
      customer.deleted ||
      customer.livemode ||
      customer.metadata.userId !== userId
    )
      throw new CheckoutError('customer_ownership_conflict', 409);
    if (customer.email !== verifiedEmail) {
      // Repeating this assignment is safe; do not change creation idempotency.
      await this.call(() =>
        this.stripe.customers.update(customerId, {
          email: verifiedEmail,
        }),
      );
    }
  }
  async hasBlockingSubscription(customerId: string) {
    return this.call(async () => {
      for await (const subscription of this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      })) {
        if (
          subscription.livemode ||
          !['canceled', 'incomplete_expired'].includes(subscription.status)
        )
          return true;
      }
      return false;
    });
  }
  /**
   * Validate test mode, subscription checkout fields and any hosted URL before
   * mapping the provider response. The service must still match its ownership
   * references to the saved attempt and check whether checkout can be resumed.
   */
  private session(result: Stripe.Checkout.Session): CheckoutSession {
    if (
      result.livemode ||
      !result.id.startsWith('cs_test_') ||
      result.mode !== 'subscription' ||
      typeof result.customer !== 'string' ||
      (result.status !== 'open' &&
        result.status !== 'complete' &&
        result.status !== 'expired') ||
      !result.metadata?.userId ||
      !result.metadata.requestId
    )
      throw new CheckoutError('checkout_ownership_conflict', 409);
    if (result.url) {
      const url = new URL(result.url);
      if (
        url.origin !== 'https://checkout.stripe.com' ||
        url.username ||
        url.password
      )
        throw new CheckoutError('checkout_url_invalid', 503);
    }
    return {
      id: result.id,
      customerId: result.customer,
      userId: result.metadata.userId,
      requestId: result.metadata.requestId,
      status:
        result.status === 'open'
          ? 'open'
          : result.status === 'complete'
            ? 'complete'
            : 'expired',
      expiresAt: result.expires_at,
      url: result.url,
    };
  }
  async createSession(attempt: CheckoutAttempt) {
    const metadata = {
      userId: attempt.userId,
      requestId: attempt.requestId,
      planId: 'premium_monthly',
    };
    const result = await this.call(() =>
      this.stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: attempt.customerId,
          client_reference_id: attempt.userId,
          line_items: [{ price: attempt.priceId, quantity: 1 }],
          allowed_payment_method_types: ['card'],
          success_url: attempt.successUrl,
          cancel_url: attempt.cancelUrl,
          expires_at: attempt.expiresAt,
          metadata,
          subscription_data: { metadata },
        },
        {
          idempotencyKey: `premiumpass-checkout-${attempt.userId}-${attempt.requestId}`,
        },
      ),
    );
    return this.session(result);
  }
  async getSession(sessionId: string) {
    return this.session(
      await this.call(() => this.stripe.checkout.sessions.retrieve(sessionId)),
    );
  }
}

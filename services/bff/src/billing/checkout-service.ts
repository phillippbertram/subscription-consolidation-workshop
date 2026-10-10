import { createHash } from 'node:crypto';
import {
  CheckoutError,
  type BillingProvider,
  type BillingStore,
  type CheckoutAttempt,
  type CheckoutSession,
} from './contracts.js';

export class CheckoutService {
  constructor(
    private readonly store: BillingStore,
    private readonly provider: BillingProvider,
    private readonly config: { priceId: string; webOrigin: string },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private seconds() {
    return Math.floor(this.now().getTime() / 1000);
  }

  private async customer(userId: string, verifiedEmail: string) {
    const mapping = await this.store.reserveCustomer(userId, this.seconds());
    let customerId = mapping.customerId;
    if (!customerId) {
      // Stripe retains idempotency results for at least 24 hours. Never blindly
      // recreate a customer after an old unresolved request may have been pruned.
      if (this.seconds() - mapping.createdAt >= 23 * 3600)
        throw new CheckoutError('customer_recovery_required', 409);
      customerId = await this.provider.createCustomer(mapping);
      await this.store.saveCustomer(mapping, customerId);
    }
    if ((await this.store.getCustomerOwner(customerId)) !== userId)
      throw new CheckoutError('customer_ownership_conflict', 409);
    // Keep customer creation parameters stable for recovery of older requests.
    // Synchronize email separately, including customers created before prefill.
    await this.provider.syncCustomerEmail(customerId, userId, verifiedEmail);
    return customerId;
  }

  private verifySession(session: CheckoutSession, attempt: CheckoutAttempt) {
    if (
      session.customerId !== attempt.customerId ||
      session.userId !== attempt.userId ||
      session.requestId !== attempt.requestId
    ) {
      throw new CheckoutError('checkout_ownership_conflict', 409);
    }
  }

  private async session(attempt: CheckoutAttempt) {
    if (attempt.sessionId) {
      const session = await this.provider.getSession(attempt.sessionId);
      this.verifySession(session, attempt);
      return session;
    }
    // The fixed one-hour expiry is part of the persisted Stripe request.
    // Stop retries before it can violate Stripe's 30-minute minimum expiry.
    if (this.seconds() - attempt.createdAt >= 20 * 60)
      throw new CheckoutError('checkout_recovery_required', 409);
    const session = await this.provider.createSession(attempt);
    this.verifySession(session, attempt);
    await this.store.saveSession(attempt, session.id);
    return session;
  }

  async start(
    userId: string,
    requestId: string,
    planId: string,
    verifiedEmail: string,
  ): Promise<{ sessionId: string; url: string; expiresAt: string }> {
    const successUrl = `${this.config.webOrigin}/?checkout=success`;
    const cancelUrl = `${this.config.webOrigin}/?checkout=cancel`;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          planId,
          priceId: this.config.priceId,
          successUrl,
          cancelUrl,
        }),
      )
      .digest('hex');
    let attempt = await this.store.getAttempt(userId, requestId);
    if (attempt && attempt.fingerprint !== fingerprint)
      throw new CheckoutError('idempotency_conflict', 409);
    if (planId !== 'premium_monthly')
      throw new CheckoutError('unsupported_plan', 400);
    const customerId = await this.customer(userId, verifiedEmail);

    if (!attempt) {
      // Fail before reserving a purchase when the configured price is unusable.
      await this.provider.validatePrice(this.config.priceId);
      const previousId = await this.store.getActiveAttemptId(userId);
      if (previousId) {
        // A concurrent call may have reserved this same request since our read.
        // Its request and active pointer were committed atomically.
        if (previousId === requestId)
          return this.start(userId, requestId, planId, verifiedEmail);
        const previous = await this.store.getAttempt(userId, previousId);
        if (!previous || previous.customerId !== customerId)
          throw new CheckoutError('checkout_recovery_required', 409);
        const session = await this.session(previous);
        if (session.status !== 'expired')
          throw new CheckoutError(
            session.status === 'complete'
              ? 'checkout_already_completed'
              : 'checkout_in_progress',
            409,
          );
      }
      if (await this.provider.hasBlockingSubscription(customerId))
        throw new CheckoutError('subscription_already_exists', 409);
      const createdAt = this.seconds();
      const candidate: CheckoutAttempt = {
        userId,
        requestId,
        fingerprint,
        customerId,
        priceId: this.config.priceId,
        successUrl,
        cancelUrl,
        createdAt,
        expiresAt: createdAt + 3600,
      };
      if (await this.store.reserveAttempt(candidate, previousId))
        attempt = candidate;
      else {
        attempt = await this.store.getAttempt(userId, requestId);
        if (!attempt) throw new CheckoutError('checkout_in_progress', 409);
        if (attempt.fingerprint !== fingerprint)
          throw new CheckoutError('idempotency_conflict', 409);
      }
    }
    if (attempt.customerId !== customerId)
      throw new CheckoutError('customer_ownership_conflict', 409);
    const session = await this.session(attempt);
    if (
      session.status !== 'open' ||
      session.expiresAt <= this.seconds() ||
      !session.url
    ) {
      throw new CheckoutError(
        session.status === 'complete'
          ? 'checkout_already_completed'
          : 'checkout_expired',
        409,
      );
    }
    return {
      sessionId: session.id,
      url: session.url,
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    };
  }
}

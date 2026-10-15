import type { SubscriptionStore } from '@premiumpass/domain';
import {
  CheckoutError,
  type BillingStore,
  type CancellationProvider,
} from './contracts.js';

export class CancellationService {
  constructor(
    private readonly billing: Pick<
      BillingStore,
      'getCustomer' | 'getCustomerOwner'
    >,
    private readonly subscriptions: SubscriptionStore,
    private readonly provider: CancellationProvider,
  ) {}

  async cancel(userId: string, subscriptionId: string) {
    const subscriptions = await this.subscriptions.listForUser(userId);
    const subscription = subscriptions.find(
      (item) =>
        item.userId === userId &&
        item.provider === 'stripe' &&
        item.providerSubscriptionId === subscriptionId &&
        item.productId === 'premium_monthly',
    );
    const mapping = await this.billing.getCustomer(userId);
    if (
      !subscription ||
      !mapping?.customerId ||
      (await this.billing.getCustomerOwner(mapping.customerId)) !== userId
    ) {
      throw new CheckoutError('subscription_not_owned', 403);
    }

    // Provider mutation never changes local access directly. The signed webhook
    // and worker synchronize this subscription without removing other grants.
    return this.provider.cancelAtPeriodEnd(
      subscriptionId,
      mapping.customerId,
      userId,
    );
  }
}

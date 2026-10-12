import type { Subscription } from '@premiumpass/domain';
import type { StripeJob } from '@premiumpass/billing-contracts';

export interface SubscriptionTarget {
  customerId: string;
  subscriptionId: string;
}

export interface ProviderSnapshot {
  providerSubscriptionId: string;
  productId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  paidUntil: string | null;
  trialUntil: string | null;
}

export interface SubscriptionSource {
  locate(job: StripeJob): Promise<SubscriptionTarget | null>;
  read(
    target: SubscriptionTarget,
    userId: string,
    now: Date,
  ): Promise<ProviderSnapshot>;
}

export interface Aggregate {
  userId: string;
  revision: number;
  subscriptions: Subscription[];
}

export interface ProcessingStore {
  isProcessed(eventId: string): Promise<boolean>;
  owner(customerId: string): Promise<string>;
  load(userId: string): Promise<Aggregate>;
  commitStripe(
    aggregate: Aggregate,
    subscription: Subscription,
    customerId: string,
    job: StripeJob,
    now: Date,
    changed: boolean,
  ): Promise<void>;
}

export class ProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProcessingError';
  }
}

export class RevisionConflict extends ProcessingError {
  constructor() {
    super('revision_conflict');
  }
}

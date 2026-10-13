import type { Subscription } from '@premiumpass/domain';
import type { StripeJob } from '@premiumpass/billing-contracts';

/**
 * Provider object references resolved from a queued event. They identify what
 * to refresh; stored mappings and a fresh provider read must still prove ownership.
 */
export interface SubscriptionTarget {
  customerId: string;
  subscriptionId: string;
}

/**
 * Current provider data after ownership and payment verification, ready for
 * domain normalization. It contains no raw webhook or payment payload.
 */
export interface ProviderSnapshot {
  providerSubscriptionId: string;
  /** Internal plan identifier, or an unmapped marker that grants no access. */
  productId: string;
  /** Original provider status; normalization maps it to a domain state. */
  status: string;
  cancelAtPeriodEnd: boolean;
  /** UTC ISO boundary proven by paid invoice lines, or null without evidence. */
  paidUntil: string | null;
  /** UTC ISO trial boundary capped by the item period, or null if unavailable. */
  trialUntil: string | null;
}

/** Provider-read boundary used by the processor without HTTP or queue handling. */
export interface SubscriptionSource {
  /**
   * Resolve customer/subscription references; null means a non-subscription
   * event that can be ignored. Invalid references and provider failures throw.
   */
  locate(job: StripeJob): Promise<SubscriptionTarget | null>;
  /**
   * Fetch fresh state after loading the local aggregate revision, checking
   * ownership against userId and payment periods against the supplied clock.
   * Never reuse locate's earlier data or grant extra time on provider failure.
   */
  read(
    target: SubscriptionTarget,
    userId: string,
    now: Date,
  ): Promise<ProviderSnapshot>;
}

/**
 * One user's subscriptions across providers plus the revision guarding writes.
 * Reads are not an atomic snapshot; the commit must reject an outdated revision.
 */
export interface Aggregate {
  userId: string;
  /** Aggregate revision, separate from source revisions; zero means no snapshot. */
  revision: number;
  subscriptions: Subscription[];
}

/**
 * Durable processing boundary for ownership, duplicate detection and atomic
 * state/outbox writes. Queue acknowledgement belongs to the transport layer.
 */
export interface ProcessingStore {
  /** Check durable completion; a false result does not reserve the event. */
  isProcessed(eventId: string): Promise<boolean>;
  /** Resolve matching forward/reverse customer mappings; missing owners throw. */
  owner(customerId: string): Promise<string>;
  /** Read the aggregate revision before all subscriptions using consistent reads. */
  load(userId: string): Promise<Aggregate>;
  /**
   * Recheck ownership and atomically write the subscription, all-provider access
   * snapshot, owner binding and completion marker at aggregate.revision + 1.
   * Add a pending outbox event only when changed indicates a domain change.
   * Reject stale revisions with RevisionConflict; other failures also throw.
   * Resolve only after commit so the caller can safely acknowledge the job.
   */
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

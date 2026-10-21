import { ProcessingError } from '../../processing/contracts.js';
import { retryOnRevisionConflict } from '../../processing/retry.js';
import type {
  StripeSource,
  StripeProcessingStore,
  StripeProcessingJob,
} from './contracts.js';
import { normalizeStripeSubscription } from './normalize.js';
import { hasSubscriptionChanged } from '../../processing/subscription-state.js';

// Refresh Stripe state without depending on Hono or SQS APIs.
// Transports decide when to acknowledge; state updates return only after commit.
export class StripeSubscriptionProcessor {
  /** Inject storage, provider reads and a clock sampled for each refresh attempt. */
  constructor(
    private readonly store: StripeProcessingStore,
    private readonly source: StripeSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Refresh current provider state and commit verified access for a queued event.
   * Return early for completed events or references without a subscription.
   * Unresolved failures throw so the transport can retry instead of acknowledging.
   */
  async process(job: StripeProcessingJob) {
    return retryOnRevisionConflict({
      // Fast path for repeated delivery. The transaction also guards the marker:
      // two workers can both observe it as absent before either commits.
      isProcessed: () => this.store.isProcessed(job.eventId),
      attempt: () => this.refresh(job),
    });
  }

  private async refresh(job: StripeProcessingJob) {
    // locate resolves references only. Its earlier provider read must not be
    // reused as state after the local revision has been loaded.
    const target = await this.source.locate(job);
    // A one-off invoice has no subscription and cannot grant access.
    if (!target) {
      return { outcome: 'ignored_non_subscription' };
    }

    const userId = await this.store.owner(target.customerId);
    if (job.eventType === 'reconciliation' && userId !== job.expectedUserId) {
      throw new ProcessingError('reconciliation_owner_mismatch');
    }

    // Load the revision BEFORE reading Stripe, so a concurrent write is detected.
    const aggregate = await this.store.load(userId);
    const now = this.now();
    const snapshot = await this.source.read(target, userId, now);
    const previous = aggregate.subscriptions.find(
      (candidate) =>
        candidate.provider === 'stripe' &&
        candidate.providerSubscriptionId === target.subscriptionId,
    );
    const subscription = normalizeStripeSubscription(
      userId,
      snapshot,
      previous,
      now,
    );

    // Complete a fresh verification even when business fields are unchanged,
    // but emit an outbox event only for source changes or a due access boundary.
    const changed = hasSubscriptionChanged(aggregate, subscription, now);
    await this.store.commit(
      aggregate,
      subscription,
      target.customerId,
      job,
      now,
      changed,
    );

    const revision = aggregate.revision + 1;
    // The normalized subscription lets the worker log what it concluded from
    // Stripe's answer; the worker decides which fields are safe to show.
    return {
      outcome: changed ? 'changed' : 'verified',
      userId,
      revision,
      subscription,
      ...(changed ? { domainEventId: `${userId}:${revision}` } : {}),
    };
  }
}

import { setTimeout } from 'node:timers/promises';
import {
  ProcessingError,
  RevisionConflict,
  expirationDue,
  type SubscriptionSource,
  type ProcessingStore,
  type StripeProcessingJob,
} from './contracts.js';
import { normalizeSubscription, sameDomainState } from './normalize.js';

// Orchestrates a provider refresh without depending on Hono or SQS APIs.
// Transports decide when to acknowledge; state updates return only after commit.
export class SubscriptionProcessor {
  /** Inject storage, provider reads and a clock sampled for each refresh attempt. */
  constructor(
    private readonly store: ProcessingStore,
    private readonly source: SubscriptionSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Refresh current provider state and commit verified access for a queued event.
   * Return early for completed events or references without a subscription.
   * Revision conflicts repeat local/provider reads within a bounded retry budget;
   * unresolved failures throw so the transport can retry instead of acknowledging.
   */
  async process(job: StripeProcessingJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Fast path for repeated delivery. The transaction also guards the marker:
      // two workers can both observe it as absent before either commits.
      if (await this.store.isProcessed(job.eventId)) {
        return { outcome: 'duplicate' };
      }

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

      const aggregate = await this.store.load(userId);
      // Never reuse a pre-conflict snapshot: both local and provider reads repeat.
      const now = this.now();
      const snapshot = await this.source.read(target, userId, now);
      const previous = aggregate.subscriptions.find(
        (s) =>
          s.provider === 'stripe' &&
          s.providerSubscriptionId === target.subscriptionId,
      );
      const subscription = normalizeSubscription(
        userId,
        snapshot,
        previous,
        now,
      );
      // Complete a fresh verification even when business fields are unchanged,
      // but emit an outbox event only for source changes or a due access boundary.
      const changed =
        !previous ||
        !sameDomainState(previous, subscription) ||
        expirationDue(aggregate, now);
      try {
        await this.store.commitStripe(
          aggregate,
          subscription,
          target.customerId,
          job,
          now,
          changed,
        );
        return {
          outcome: changed ? 'changed' : 'verified',
          userId,
          revision: aggregate.revision + 1,
          ...(changed
            ? { domainEventId: `${userId}:${aggregate.revision + 1}` }
            : {}),
        };
      } catch (error) {
        // Another worker may have completed the event, or the commit response
        // may have been lost. Durable completion evidence resolves both cases.
        if (await this.store.isProcessed(job.eventId)) {
          return { outcome: 'duplicate' };
        }

        if (!(error instanceof RevisionConflict)) {
          throw error;
        }

        // Jitter avoids repeated lockstep collisions. After this bounded loop,
        // SQS owns further retries and eventual DLQ routing.
        await setTimeout(25 + Math.random() * 75);
      }
    }

    throw new ProcessingError('concurrency_retry_exhausted');
  }
}

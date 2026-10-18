import { setTimeout } from 'node:timers/promises';
import type { AppleProcessingJob } from '@premiumpass/billing-contracts';
import type { DynamoDbProcessingStore } from './dynamodb-processing.js';
import type { AppleSubscriptionSource } from './apple-source.js';
import { sameDomainState } from './normalize.js';
import {
  ProcessingError,
  RevisionConflict,
  expirationDue,
} from './contracts.js';

export class AppleSubscriptionProcessor {
  constructor(
    private readonly store: DynamoDbProcessingStore,
    private readonly source: Pick<AppleSubscriptionSource, 'read' | 'finish'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: AppleProcessingJob) {
    // Delivery has two durable milestones: our access commit and Apple's finish.
    // They cannot be atomic across systems. Store the finish target with the
    // commit so a retry can resume the second step before queue acknowledgement.
    const result = await this.commit(job);
    const processing = await this.store.getAppleProcessing(job);
    if (!processing) {
      throw new ProcessingError('apple_processing_marker_missing');
    }

    // A committed event skips domain writes, never an outstanding Apple finish.
    // If Apple succeeds but this write fails, redelivery repeats the same finish.
    if (!processing.finishedAt) {
      await this.source.finish(processing.finishTransactionId);
      await this.store.markAppleFinished(
        job,
        processing.finishTransactionId,
        this.now(),
      );
    }

    return result;
  }

  private async commit(job: AppleProcessingJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.store.getAppleProcessing(job)) {
        return { outcome: 'duplicate' };
      }

      // Load the revision BEFORE fetching Apple state, including after conflicts.
      const aggregate = await this.store.load(job.userId);
      const now = this.now();
      const { subscription, finishTransactionId } = await this.source.read(
        job,
        aggregate.subscriptions,
        now,
      );
      const previous = aggregate.subscriptions.find(
        (s) =>
          s.provider === 'apple' &&
          s.providerSubscriptionId === subscription.providerSubscriptionId,
      );
      const changed =
        !previous ||
        !sameDomainState(previous, subscription) ||
        expirationDue(aggregate, now);
      try {
        await this.store.commitApple(
          aggregate,
          subscription,
          job,
          now,
          changed,
          finishTransactionId,
        );
        return {
          outcome: changed ? 'changed' : 'verified',
          userId: job.userId,
          revision: aggregate.revision + 1,
        };
      } catch (error) {
        if (await this.store.getAppleProcessing(job)) {
          return { outcome: 'duplicate' };
        }

        if (!(error instanceof RevisionConflict)) {
          throw error;
        }

        await setTimeout(25 + Math.random() * 75);
      }
    }

    throw new ProcessingError('concurrency_retry_exhausted');
  }
}

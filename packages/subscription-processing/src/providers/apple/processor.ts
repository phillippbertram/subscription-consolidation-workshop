import { setTimeout } from 'node:timers/promises';
import type { AppleProcessingJob } from '@premiumpass/billing-contracts';
import type { DynamoDbAppleStore } from './store.js';
import type { AppleSubscriptionSource } from './source.js';
import { hasSubscriptionChanged } from '../../processing/subscription-state.js';
import {
  ProcessingError,
  RevisionConflict,
} from '../../processing/contracts.js';

export class AppleSubscriptionProcessor {
  constructor(
    private readonly store: Pick<
      DynamoDbAppleStore,
      'load' | 'getProcessing' | 'commit' | 'markFinished'
    >,
    private readonly source: Pick<AppleSubscriptionSource, 'read' | 'finish'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: AppleProcessingJob) {
    // Delivery has two durable milestones: our access commit and Apple's finish.
    // They cannot be atomic across systems. Store the finish target with the
    // commit so a retry can resume the second step before queue acknowledgement.
    const result = await this.commitAccess(job);
    await this.finishCommittedTransaction(job);
    return result;
  }

  private async finishCommittedTransaction(job: AppleProcessingJob) {
    const processing = await this.store.getProcessing(job);
    if (!processing) {
      throw new ProcessingError('apple_processing_marker_missing');
    }

    // A committed event skips domain writes, never an outstanding Apple finish.
    // If Apple succeeds but this write fails, redelivery repeats the same finish.
    if (!processing.finishedAt) {
      await this.source.finish(processing.finishTransactionId);
      await this.store.markFinished(
        job,
        processing.finishTransactionId,
        this.now(),
      );
    }
  }

  private async commitAccess(job: AppleProcessingJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.store.getProcessing(job)) {
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
      const changed = hasSubscriptionChanged(aggregate, subscription, now);
      try {
        await this.store.commit(
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
        if (await this.store.getProcessing(job)) {
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

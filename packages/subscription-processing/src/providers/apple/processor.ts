import type { AppleProcessingJob } from '@premiumpass/billing-contracts';
import type { DynamoDbAppleStore } from './store.js';
import type { AppleSubscriptionSource } from './source.js';
import { hasSubscriptionChanged } from '../../processing/subscription-state.js';
import { ProcessingError } from '../../processing/contracts.js';
import { retryOnRevisionConflict } from '../../processing/retry.js';

/**
 * Apple purchases and notifications follow the shared processor shape
 * (load revision → read provider → translate → commit) plus one extra step:
 * after the commit, tell Apple the transaction was handled ("finish").
 */
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
    const result = await retryOnRevisionConflict({
      isProcessed: async () => Boolean(await this.store.getProcessing(job)),
      attempt: () => this.commitAccess(job),
    });
    await this.finishCommittedTransaction(job);
    return result;
  }

  private async commitAccess(job: AppleProcessingJob) {
    // Load the revision BEFORE fetching Apple state, including after conflicts.
    const aggregate = await this.store.load(job.userId);
    const now = this.now();
    const { subscription, finishTransactionId } = await this.source.read(
      job,
      aggregate.subscriptions,
      now,
    );
    const changed = hasSubscriptionChanged(aggregate, subscription, now);
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
      subscription,
    };
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
}

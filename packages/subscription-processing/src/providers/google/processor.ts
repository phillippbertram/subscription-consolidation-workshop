import { setTimeout } from 'node:timers/promises';
import type { GoogleJob } from '@premiumpass/billing-contracts';
import type { DynamoDbGoogleStore } from './store.js';
import type { GoogleSubscriptionSource } from './source.js';
import {
  ProcessingError,
  RevisionConflict,
} from '../../processing/contracts.js';
import { hasSubscriptionChanged } from '../../processing/subscription-state.js';

export class GoogleSubscriptionProcessor {
  constructor(
    private readonly store: Pick<
      DynamoDbGoogleStore,
      'load' | 'getProcessing' | 'commit' | 'markCompleted'
    >,
    private readonly source: Pick<
      GoogleSubscriptionSource,
      'locate' | 'read' | 'acknowledge'
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Commit once, then resume acknowledgement from the durable marker on retries. */
  async process(job: GoogleJob) {
    const result = await this.commitAccess(job);
    await this.acknowledgeCommittedPurchase(job);
    return result;
  }

  private async acknowledgeCommittedPurchase(job: GoogleJob) {
    const processing = await this.store.getProcessing(job);
    if (!processing) {
      throw new ProcessingError('google_processing_marker_missing');
    }

    if (!processing.completedAt) {
      if (processing.needsAcknowledgement) {
        await this.source.acknowledge(job, processing.userId);
      }

      await this.store.markCompleted(job, processing.userId, this.now());
    }
  }

  private async commitAccess(job: GoogleJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.store.getProcessing(job)) {
        return { outcome: 'duplicate' };
      }

      // Client/internal jobs already name the authenticated owner. RTDN must
      // first discover it from Google; all paths verify again after load().
      const userId = job.userId ?? (await this.source.locate(job)).userId;
      const aggregate = await this.store.load(userId);
      const now = this.now();
      // Re-read Google AFTER the aggregate revision, also after a conflict.
      const verified = await this.source.read(
        { ...job, userId },
        aggregate.subscriptions,
        now,
      );
      const changed = hasSubscriptionChanged(
        aggregate,
        verified.subscription,
        now,
      );
      try {
        await this.store.commit(
          aggregate,
          verified.subscription,
          job,
          now,
          changed,
          verified.needsAcknowledgement,
        );
        return { outcome: changed ? 'changed' : 'verified', userId };
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

import { setTimeout } from 'node:timers/promises';
import type { AppleJob } from '@premiumpass/billing-contracts';
import type { DynamoDbProcessingStore } from './dynamodb-processing.js';
import type { AppleSubscriptionSource } from './apple-source.js';
import { sameDomainState } from './normalize.js';
import { ProcessingError, RevisionConflict } from './contracts.js';

export class AppleSubscriptionProcessor {
  constructor(
    private readonly store: DynamoDbProcessingStore,
    private readonly source: Pick<AppleSubscriptionSource, 'read'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: AppleJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.store.isAppleProcessed(job))
        return { outcome: 'duplicate' };
      // Load the revision BEFORE fetching Apple state, including after conflicts.
      const aggregate = await this.store.load(job.userId);
      const now = this.now();
      const subscription = await this.source.read(
        job,
        aggregate.subscriptions,
        now,
      );
      const previous = aggregate.subscriptions.find(
        (s) =>
          s.provider === 'apple' &&
          s.providerSubscriptionId === subscription.providerSubscriptionId,
      );
      const changed = !previous || !sameDomainState(previous, subscription);
      try {
        await this.store.commitApple(
          aggregate,
          subscription,
          job,
          now,
          changed,
        );
        return {
          outcome: changed ? 'changed' : 'verified',
          userId: job.userId,
          revision: aggregate.revision + 1,
        };
      } catch (error) {
        if (await this.store.isAppleProcessed(job))
          return { outcome: 'duplicate' };
        if (!(error instanceof RevisionConflict)) throw error;
        await setTimeout(25 + Math.random() * 75);
      }
    }
    throw new ProcessingError('concurrency_retry_exhausted');
  }
}

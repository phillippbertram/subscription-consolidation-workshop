import { setTimeout } from 'node:timers/promises';
import type { GoogleMockJob } from '@premiumpass/billing-contracts';
import { type GoogleMockSource, normalizeGoogleMock } from './source.js';
import { ProcessingError } from '../../processing/contracts.js';
import { hasSubscriptionChanged } from '../../processing/subscription-state.js';
import type { DynamoDbGoogleMockStore } from './store.js';

export class GoogleMockProcessor {
  constructor(
    private readonly store: Pick<
      DynamoDbGoogleMockStore,
      'load' | 'isProcessed' | 'commit'
    >,
    private readonly source: Pick<GoogleMockSource, 'read'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: GoogleMockJob) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await this.store.isProcessed(job)) {
        return { outcome: 'duplicate' };
      }

      const aggregate = await this.store.load(job.userId);
      const state = await this.source.read(job.userId, job.subscriptionId);
      if (!state) {
        throw new ProcessingError('google_mock_state_missing');
      }

      const now = this.now();
      const previous = aggregate.subscriptions.find(
        (candidate) =>
          candidate.provider === 'google_mock' &&
          candidate.providerSubscriptionId === job.subscriptionId,
      );
      const subscription = normalizeGoogleMock(state, previous, now);
      const changed = hasSubscriptionChanged(aggregate, subscription, now);
      try {
        await this.store.commit(
          aggregate,
          subscription,
          state,
          job,
          now,
          changed,
        );
        return { outcome: changed ? 'changed' : 'verified' };
      } catch (error) {
        if (await this.store.isProcessed(job)) {
          return { outcome: 'duplicate' };
        }

        // The independent source revision can change without advancing the
        // aggregate. Retry both kinds of transaction conflict with fresh reads.
        if (
          !(error instanceof ProcessingError) ||
          !['revision_conflict', 'transaction_failed'].includes(error.code)
        ) {
          throw error;
        }

        await setTimeout(25 + Math.random() * 75);
      }
    }

    throw new ProcessingError('google_mock_commit_failed');
  }
}

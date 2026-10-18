import {
  GoogleMockSource,
  type mockScenarios,
} from '@premiumpass/subscription-processing/google-mock';
import type { LocalSubscriptionStore } from './store.js';
import { localReconciliationQueue } from '../reconciliation/local-runtime.js';

export async function setGoogleMock(
  local: LocalSubscriptionStore,
  userId: string,
  subscriptionId: string,
  scenario: (typeof mockScenarios)[number],
  options: { until?: string; suppressEvent?: boolean },
) {
  try {
    const { state, job } = await new GoogleMockSource(
      local.documentClient,
      local.tableName,
    ).set(userId, subscriptionId, scenario, new Date(), options.until);
    console.info(
      `Saved Google mock source revision ${state.revision}. Derived access has not been updated by this command.`,
    );
    if (options.suppressEvent) {
      console.info(
        'Notification suppressed. Reconciliation can discover the source change.',
      );
      return;
    }

    const queue = localReconciliationQueue();
    try {
      await queue.enqueue(job);
    } finally {
      queue.close();
    }

    console.info(
      'Notification accepted by the local queue. Check worker logs for processing.',
    );
  } catch {
    throw new Error(
      'Google mock command failed. Check user/ownership, scenario, time, and local services. If source state was saved, reconcile to retry delivery.',
    );
  }
}

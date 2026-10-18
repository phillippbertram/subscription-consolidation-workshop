import { googleJobSchema } from '@premiumpass/billing-contracts';
import type { GoogleReconciliationStore } from '@premiumpass/subscription-processing/google/discovery';
import { runReconciliation, type ReconciliationRun } from './run.js';

export function runGoogleReconciliation(
  options: ReconciliationRun & {
    store: Pick<GoogleReconciliationStore, 'list'>;
    packageName: string;
  },
) {
  return runReconciliation({
    ...options,
    provider: 'google',
    references: options.store.list(options.checkTime, options.pageSize),
    describe: (reference) => ({
      userId: reference.userId,
      referenceId: reference.subscriptionId,
    }),
    jobs: (reference) => [
      googleJobSchema.parse({
        provider: 'google',
        environment: 'test',
        eventType: 'reconciliation',
        packageName: options.packageName,
        purchaseToken: reference.purchaseToken,
        userId: reference.userId,
        // Same event retry: same ID. A later schedule tick can verify new state.
        eventId: `reconcile_${options.runId}_${reference.subscriptionId.split(':')[1]}`,
        correlationId: options.runId,
        receivedAt: options.receivedAt,
      }),
    ],
  });
}

import { appleReconciliationJobSchema } from '@premiumpass/billing-contracts';
import type { AppleReconciliationStore } from '@premiumpass/subscription-processing/apple/discovery';
import { runReconciliation, type ReconciliationRun } from './run.js';

export function runAppleReconciliation(
  options: ReconciliationRun & {
    store: Pick<AppleReconciliationStore, 'list'>;
  },
) {
  return runReconciliation({
    ...options,
    provider: 'apple',
    references: options.store.list(options.checkTime, options.pageSize),
    describe: (reference) => ({
      userId: reference.userId,
      referenceId: `Sandbox:${reference.originalTransactionId}`,
    }),
    jobs: (reference) => [
      appleReconciliationJobSchema.parse({
        provider: 'apple',
        environment: 'Sandbox',
        eventType: 'reconciliation',
        userId: reference.userId,
        transactionId: reference.originalTransactionId,
        eventId: `reconcile_${options.runId}_${reference.originalTransactionId}`,
        correlationId: options.runId,
        receivedAt: options.receivedAt,
      }),
    ],
  });
}

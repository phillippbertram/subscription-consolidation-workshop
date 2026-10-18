import { stripeReconciliationJobSchema } from '@premiumpass/billing-contracts';
import type {
  StripeReconciliationStore,
  StripeCustomerReference,
} from '@premiumpass/subscription-processing/stripe/discovery';
import { runReconciliation, type ReconciliationRun } from './run.js';

export function runStripeReconciliation(
  options: ReconciliationRun & {
    store: Pick<StripeReconciliationStore, 'list'>;
    subscriptions: (
      reference: StripeCustomerReference,
      checkTime: () => void,
    ) => Promise<string[]>;
  },
) {
  return runReconciliation({
    ...options,
    provider: 'stripe',
    references: options.store.list(options.checkTime, options.pageSize),
    describe: (reference) => ({
      userId: reference.userId,
      referenceId: reference.customerId,
    }),
    async jobs(reference) {
      // No jobs escape a customer listing until every page passes ownership checks.
      const ids = await options.subscriptions(reference, options.checkTime);
      return ids.map((objectId) =>
        stripeReconciliationJobSchema.parse({
          provider: 'stripe',
          eventType: 'reconciliation',
          expectedUserId: reference.userId,
          objectId,
          eventId: `reconcile_${options.runId}_${objectId}`,
          correlationId: options.runId,
          receivedAt: options.receivedAt,
        }),
      );
    },
  });
}

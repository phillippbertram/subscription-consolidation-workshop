import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { Subscription } from '@premiumpass/domain';
import type { StripeReconciliationJob } from '@premiumpass/billing-contracts';
import {
  ProcessingError,
  type ProcessingStore,
} from '../processing/contracts.js';
import {
  normalizeSubscription,
  sameDomainState,
} from '../processing/normalize.js';
import { SubscriptionProcessor } from '../processing/processor.js';
import { StripeSubscriptionSource } from '../processing/stripe-source.js';

export interface ReconciliationRow {
  subscription: string;
  result: string;
  before: string;
  after: string;
}

function describe(subscription: Subscription | undefined) {
  return subscription
    ? `${subscription.productId}, ${subscription.state} (${subscription.providerStatus}); access: ${subscription.accessUntil ?? 'none'}; grace: ${subscription.graceUntil ?? 'none'}; ending: ${subscription.cancelAtPeriodEnd}`
    : 'Not stored';
}

/**
 * Only reads (fetches) data from Stripe directly in this function;
 * any database modifications (writes) follow the same owner verification and compare-and-swap (CAS)
 * logic as used for processing webhook jobs. No direct mutation of state outside of those protected flows.
 */
export async function reconcileStripeSubscriptions(options: {
  stripe: Stripe;
  priceId: string;
  store: ProcessingStore;
  userId: string;
  customerId: string;
  dryRun: boolean;
  onProgress?: (message: string) => void;
  runId?: string;
  now?: () => Date;
  enqueue?: (job: StripeReconciliationJob) => Promise<void>;
  signal?: AbortSignal;
}) {
  const { stripe, priceId, store, userId, customerId, dryRun } = options;
  if ((await store.owner(customerId)) !== userId) {
    throw new ProcessingError('reconciliation_owner_mismatch');
  }

  // Loads all subscriptions for the user, then extracts the set of providerSubscriptionIds
  // for subscriptions where the provider is 'stripe'. These IDs represent the Stripe subscriptions
  // currently tracked in the local store for this user, and will be used to reconcile with Stripe.
  const aggregate = await store.load(userId);
  const ids = new Set(
    aggregate.subscriptions
      .filter((s) => s.provider === 'stripe')
      .map((s) => s.providerSubscriptionId),
  );
  // Finish paginated discovery before writing. An incomplete provider listing
  // is never evidence that a local subscription ended or should be deleted.
  options.onProgress?.('Discovering Stripe subscriptions…');
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    if (options.signal?.aborted) {
      return [];
    }

    const owner =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
    if (
      subscription.livemode ||
      owner !== customerId ||
      subscription.metadata.userId !== userId
    ) {
      throw new ProcessingError('provider_owner_mismatch');
    }

    ids.add(subscription.id);
  }

  const source = new StripeSubscriptionSource(stripe, priceId);
  const clock = options.now ?? (() => new Date());
  const processor = new SubscriptionProcessor(store, source, clock);
  const runId = options.runId ?? randomUUID();
  const rows: ReconciliationRow[] = [];
  for (const subscriptionId of ids) {
    if (options.signal?.aborted) {
      break;
    }

    options.onProgress?.(`Checking ${subscriptionId}…`);
    const previous = aggregate.subscriptions.find(
      (s) =>
        s.provider === 'stripe' && s.providerSubscriptionId === subscriptionId,
    );
    try {
      let next: Subscription | undefined;
      let result: string;
      if (dryRun) {
        const snapshot = await source.read(
          { customerId, subscriptionId },
          userId,
          clock(),
        );
        next = normalizeSubscription(userId, snapshot, previous, clock());
        result =
          previous && sameDomainState(previous, next)
            ? 'unchanged'
            : previous
              ? 'would update'
              : 'would create';
      } else {
        const job: StripeReconciliationJob = {
          provider: 'stripe',
          eventId: `reconcile_${runId}_${subscriptionId}`,
          eventType: 'reconciliation',
          expectedUserId: userId,
          objectId: subscriptionId,
          receivedAt: clock().toISOString(),
          correlationId: runId,
        };
        if (options.enqueue) {
          await options.enqueue(job);
          result = 'queued';
          next = previous;
        } else {
          const processed = await processor.process(job);
          result = processed.outcome;
          next = (await store.load(userId)).subscriptions.find(
            (s) =>
              s.provider === 'stripe' &&
              s.providerSubscriptionId === subscriptionId,
          );
        }
      }

      rows.push({
        subscription: subscriptionId,
        result,
        before: describe(previous),
        after: describe(next),
      });
    } catch (error) {
      rows.push({
        subscription: subscriptionId,
        result: `failed: ${error instanceof ProcessingError ? error.code : 'provider_or_storage_unavailable'}`,
        before: describe(previous),
        after: 'Not confirmed; retry reconciliation',
      });
    }
  }

  return rows;
}

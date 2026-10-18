import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { Subscription } from '@premiumpass/domain';
import type { StripeReconciliationJob } from '@premiumpass/billing-contracts';
import { ProcessingError } from '../processing/contracts.js';
import type { StripeProcessingStore } from '../providers/stripe/contracts.js';
import { normalizeStripeSubscription } from '../providers/stripe/normalize.js';
import { sameDomainState } from '../processing/subscription-state.js';
import { StripeSubscriptionProcessor } from '../providers/stripe/processor.js';
import { StripeSubscriptionSource } from '../providers/stripe/source.js';

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

/** Complete provider listing before producing jobs; a partial list proves no absence. */
export async function discoverStripeSubscriptions(options: {
  stripe: Stripe;
  store: Pick<StripeProcessingStore, 'owner' | 'load'>;
  userId: string;
  customerId: string;
  checkTime?: () => void;
  signal?: AbortSignal;
}) {
  const { stripe, store, userId, customerId } = options;
  options.checkTime?.();
  if ((await store.owner(customerId)) !== userId) {
    throw new ProcessingError('reconciliation_owner_mismatch');
  }

  const aggregate = await store.load(userId);
  const ids = new Set(
    aggregate.subscriptions
      .filter((subscription) => subscription.provider === 'stripe')
      .map((subscription) => subscription.providerSubscriptionId),
  );
  options.checkTime?.();
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  })) {
    options.checkTime?.();
    if (options.signal?.aborted) {
      return { aggregate, ids: new Set<string>() };
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

  return { aggregate, ids };
}

/** Discover Stripe state first; repairs use the same guarded processor as webhooks. */
export async function reconcileStripeSubscriptions(options: {
  stripe: Stripe;
  priceId: string;
  store: StripeProcessingStore;
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
  options.onProgress?.('Discovering Stripe subscriptions…');
  const { aggregate, ids } = await discoverStripeSubscriptions({
    stripe,
    store,
    userId,
    customerId,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const source = new StripeSubscriptionSource(stripe, priceId);
  const clock = options.now ?? (() => new Date());
  const processor = new StripeSubscriptionProcessor(store, source, clock);
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
        next = normalizeStripeSubscription(userId, snapshot, previous, clock());
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

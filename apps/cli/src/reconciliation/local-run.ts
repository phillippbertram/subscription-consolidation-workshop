import { randomUUID } from 'node:crypto';
import {
  GetCommand,
  ScanCommand,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type Stripe from 'stripe';
import type { Logger } from '@premiumpass/logging';
import { z } from 'zod';
import {
  appleReconciliationJobSchema,
  googleJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import type { AppleSubscriptionSource } from '@premiumpass/subscription-processing/apple/source';
import type { LocalSubscriptionStore } from '../local-admin/store.js';
import {
  expirationDue,
  ProcessingError,
  sameDomainState,
  type Aggregate,
} from '@premiumpass/subscription-processing';
import { reconcileStripeSubscriptions } from '@premiumpass/subscription-processing/reconciliation/stripe';
import {
  googleSubscriptionId,
  GooglePlayError,
  purchaseTokenSchema,
} from '@premiumpass/google-play/contracts';
import type { GoogleSubscriptionSource } from '@premiumpass/subscription-processing/google/source';

export interface LocalReconciliationOptions {
  local: LocalSubscriptionStore;
  log: Logger;
  enqueue: (job: SubscriptionJob) => Promise<void>;
  stripe: () => Promise<{ stripe: Stripe; productId: string }>;
  apple: () =>
    | Pick<AppleSubscriptionSource, 'read'>
    | Promise<Pick<AppleSubscriptionSource, 'read'>>;
  google?: () => GoogleSubscriptionSource | Promise<GoogleSubscriptionSource>;
  provider: 'all' | 'stripe' | 'apple' | 'google' | 'none';
  dryRun: boolean;
  userId?: string;
  runId?: string;
  now?: () => Date;
  signal?: AbortSignal;
  pageSize?: number;
}

/** Shared state of one run, passed to every per-provider step. */
interface RunContext {
  options: LocalReconciliationOptions;
  runId: string;
  clock: () => Date;
  summary: {
    runId: string;
    users: number;
    queued: number;
    discrepancies: number;
    failed: number;
  };
}

/**
 * Repair missed notifications by discovering provider state and queuing refreshes.
 * Discovery only identifies work: the worker rereads and validates current state
 * before committing through the same path used for notifications.
 *
 * For each local user: queue due expiration work, then check each selected
 * provider. A failure is counted and logged; other users and providers continue.
 */
export async function runLocalReconciliation(
  options: LocalReconciliationOptions,
) {
  // Jobs keep the same ID within a run for deduplication. A later run needs a
  // fresh ID so an earlier completion marker cannot suppress a new refresh.
  const runId = options.runId ?? randomUUID();
  const run: RunContext = {
    options,
    runId,
    clock: options.now ?? (() => new Date()),
    summary: { runId, users: 0, queued: 0, discrepancies: 0, failed: 0 },
  };

  for await (const userId of users(options)) {
    if (options.signal?.aborted) {
      break;
    }

    if (!userId) {
      run.summary.failed++;
      options.log.error({ event: 'reconciliation.invalid_profile', runId });
      continue;
    }

    run.summary.users++;
    let aggregate: Aggregate;
    try {
      aggregate = await options.local.loadUser(userId);
      await queueExpirationIfDue(run, userId, aggregate);
    } catch (error) {
      recordFailure(run, userId, 'local_expiration', error);
      continue;
    }

    if (includesProvider(options, 'stripe')) {
      await reconcileStripe(run, userId, aggregate);
    }

    if (includesProvider(options, 'apple')) {
      await reconcileApple(run, userId, aggregate);
    }

    if (includesProvider(options, 'google')) {
      await reconcileGoogle(run, userId, aggregate);
    }
  }

  options.log.info({
    event: 'reconciliation.completed',
    dryRun: options.dryRun,
    ...run.summary,
  });
  return run.summary;
}

async function* users(options: LocalReconciliationOptions) {
  if (options.userId) {
    yield z.uuid().parse(options.userId);
    return;
  }

  let cursor: ScanCommandInput['ExclusiveStartKey'];
  do {
    if (options.signal?.aborted) {
      return;
    }

    const page = await options.local.documentClient.send(
      new ScanCommand({
        TableName: options.local.tableName,
        ConsistentRead: true,
        Limit: options.pageSize ?? 100,
        FilterExpression: 'begins_with(pk, :prefix) AND sk = :profile',
        ExpressionAttributeValues: {
          ':prefix': 'USER#',
          ':profile': 'PROFILE',
        },
        ProjectionExpression: 'pk, userId',
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const item of page.Items ?? []) {
      const parsed = z.uuid().safeParse(item.userId);
      yield parsed.success && item.pk === `USER#${parsed.data}`
        ? parsed.data
        : undefined;
    }

    cursor = page.LastEvaluatedKey;
  } while (cursor);
}

/** Expiration needs no provider: a stored boundary has simply passed. */
async function queueExpirationIfDue(
  run: RunContext,
  userId: string,
  aggregate: Aggregate,
) {
  if (!expirationDue(aggregate, run.clock())) {
    return;
  }

  const { dryRun, enqueue, log } = run.options;
  run.summary.discrepancies++;
  log.info({
    event: 'reconciliation.expiration_due',
    runId: run.runId,
    userId,
    dryRun,
  });
  if (!dryRun) {
    await enqueue({
      provider: 'local_expiration',
      eventType: 'expiration',
      eventId: `expire_${run.runId}_${userId}`,
      userId,
      correlationId: run.runId,
      receivedAt: run.clock().toISOString(),
    });
    run.summary.queued++;
  }
}

/**
 * Stripe can also discover subscriptions we never stored, because the user's
 * Stripe customer can be listed. Repair runs through the shared Stripe helper.
 */
async function reconcileStripe(
  run: RunContext,
  userId: string,
  aggregate: Aggregate,
) {
  const { local, dryRun, enqueue, log, signal } = run.options;
  try {
    const mapping = (
      await local.documentClient.send(
        new GetCommand({
          TableName: local.tableName,
          Key: { pk: `USER#${userId}`, sk: 'CUSTOMER#stripe' },
          ConsistentRead: true,
        }),
      )
    ).Item;
    if (!mapping?.customerId) {
      // Stripe records without a customer mapping cannot be verified safely.
      if (aggregate.subscriptions.some((s) => s.provider === 'stripe')) {
        throw new ProcessingError('customer_owner_missing');
      }

      return;
    }

    if (
      mapping.userId !== userId ||
      !z
        .string()
        .regex(/^cus_[A-Za-z0-9]+$/)
        .safeParse(mapping.customerId).success
    ) {
      throw new ProcessingError('customer_owner_mismatch');
    }

    const credentials = await run.options.stripe();
    const rows = await reconcileStripeSubscriptions({
      ...credentials,
      store: local.stripeStore,
      userId,
      customerId: mapping.customerId as string,
      dryRun,
      runId: run.runId,
      now: run.clock,
      ...(signal ? { signal } : {}),
      enqueue: async (job) => {
        await enqueue(job);
        run.summary.queued++;
      },
    });
    for (const row of rows) {
      if (row.result.startsWith('failed:')) {
        run.summary.failed++;
      }

      if (row.result.startsWith('would ')) {
        run.summary.discrepancies++;
      }

      log.info({
        event: 'reconciliation.stripe',
        runId: run.runId,
        userId,
        subscriptionId: row.subscription,
        result: row.result,
      });
    }
  } catch (error) {
    recordFailure(run, userId, 'stripe', error);
  }
}

/**
 * Apple refreshes known purchases only. Unlike Stripe discovery, this cannot
 * recover a purchase that never reached our database at all.
 */
async function reconcileApple(
  run: RunContext,
  userId: string,
  aggregate: Aggregate,
) {
  // No known Apple subscriptions means no Apple credentials are loaded.
  let source: Pick<AppleSubscriptionSource, 'read'> | undefined;
  for (const previous of aggregate.subscriptions.filter(
    (subscription) => subscription.provider === 'apple',
  )) {
    if (run.options.signal?.aborted) {
      break;
    }

    try {
      const originalId = /^Sandbox:([0-9]{1,64})$/.exec(
        previous.providerSubscriptionId,
      )?.[1];
      if (!originalId) {
        throw new ProcessingError('apple_subscription_invalid');
      }

      const job = appleReconciliationJobSchema.parse({
        provider: 'apple',
        environment: 'Sandbox',
        eventType: 'reconciliation',
        eventId: `reconcile_${run.runId}_${originalId}`,
        transactionId: originalId,
        userId,
        correlationId: run.runId,
        receivedAt: run.clock().toISOString(),
      });
      source ??= await run.options.apple();
      const { subscription } = await source.read(
        job,
        aggregate.subscriptions,
        run.clock(),
      );
      if (run.options.signal?.aborted) {
        break;
      }

      // Preview never finishes transactions. The worker verifies again after
      // queue delivery and commits before finishing the current transaction.
      await queueRefresh(run, {
        event: 'reconciliation.apple',
        userId,
        subscriptionId: previous.providerSubscriptionId,
        changed: !sameDomainState(previous, subscription),
        job,
      });
    } catch (error) {
      recordFailure(run, userId, 'apple', error);
    }
  }
}

/** Google refreshes known purchase tokens, after checking the stored owner. */
async function reconcileGoogle(
  run: RunContext,
  userId: string,
  aggregate: Aggregate,
) {
  const { local } = run.options;
  let source: GoogleSubscriptionSource | undefined;
  for (const previous of aggregate.subscriptions.filter(
    (s) => s.provider === 'google',
  )) {
    if (run.options.signal?.aborted) {
      break;
    }

    try {
      source ??= await run.options.google?.();
      if (!source) {
        throw new ProcessingError('google_not_configured');
      }

      const { Item } = await local.documentClient.send(
        new GetCommand({
          TableName: local.tableName,
          Key: {
            pk: `PROVIDER#google#SUB#${previous.providerSubscriptionId}`,
            sk: 'OWNER',
          },
          ConsistentRead: true,
        }),
      );
      const token = purchaseTokenSchema.safeParse(Item?.purchaseToken);
      if (
        !token.success ||
        Item?.userId !== userId ||
        Item.packageName !== source.settings.packageName ||
        googleSubscriptionId(source.settings, token.data) !==
          previous.providerSubscriptionId
      ) {
        throw new ProcessingError('google_source_owner_mismatch');
      }

      const job = googleJobSchema.parse({
        provider: 'google',
        environment: 'test',
        eventType: 'reconciliation',
        packageName: source.settings.packageName,
        purchaseToken: token.data,
        eventId: `reconcile_${run.runId}_${previous.providerSubscriptionId.split(':')[1]}`,
        userId,
        correlationId: run.runId,
        receivedAt: run.clock().toISOString(),
      });
      const { subscription } = await source.read(
        job,
        aggregate.subscriptions,
        run.clock(),
      );
      if (run.options.signal?.aborted) {
        break;
      }

      await queueRefresh(run, {
        event: 'reconciliation.google',
        userId,
        subscriptionId: previous.providerSubscriptionId,
        changed: !sameDomainState(previous, subscription),
        job,
      });
    } catch (error) {
      recordFailure(run, userId, 'google', error);
    }
  }
}

/**
 * Count a difference, queue the refresh (skipped in preview), and log one row.
 * Even an unchanged subscription is queued: provider state or an access
 * boundary can change before the worker processes the job.
 */
async function queueRefresh(
  run: RunContext,
  refresh: {
    event: string;
    userId: string;
    subscriptionId: string;
    changed: boolean;
    job: SubscriptionJob;
  },
) {
  const { dryRun, enqueue, log } = run.options;
  if (refresh.changed) {
    run.summary.discrepancies++;
  }

  if (!dryRun) {
    await enqueue(refresh.job);
    run.summary.queued++;
  }

  let result = 'queued';
  if (dryRun) {
    result = refresh.changed ? 'would update' : 'unchanged';
  }

  log.info({
    event: refresh.event,
    runId: run.runId,
    userId: refresh.userId,
    subscriptionId: refresh.subscriptionId,
    result,
  });
}

function recordFailure(
  run: RunContext,
  userId: string,
  provider: string,
  error: unknown,
) {
  run.summary.failed++;
  run.options.log.error({
    event: 'reconciliation.failed',
    runId: run.runId,
    userId,
    provider,
    code:
      error instanceof ProcessingError || error instanceof GooglePlayError
        ? error.code
        : 'provider_or_storage_unavailable',
  });
}

function includesProvider(
  options: LocalReconciliationOptions,
  provider: Exclude<LocalReconciliationOptions['provider'], 'all' | 'none'>,
) {
  return options.provider === 'all' || options.provider === provider;
}

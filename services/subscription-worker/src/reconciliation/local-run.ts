import { randomUUID } from 'node:crypto';
import {
  GetCommand,
  ScanCommand,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type Stripe from 'stripe';
import type { Logger } from 'pino';
import { z } from 'zod';
import {
  appleReconciliationJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import type { AppleSubscriptionSource } from '../processing/apple-source.js';
import type { LocalSubscriptionStore } from '../local-admin/store.js';
import {
  GoogleMockSource,
  normalizeGoogleMock,
} from '../processing/google-mock-source.js';
import { expirationDue, ProcessingError } from '../processing/contracts.js';
import { sameDomainState } from '../processing/normalize.js';
import { reconcileStripeSubscriptions } from './stripe.js';

export interface LocalReconciliationOptions {
  local: LocalSubscriptionStore;
  log: Logger;
  enqueue: (job: SubscriptionJob) => Promise<void>;
  stripe: () => Promise<{ stripe: Stripe; priceId: string }>;
  apple: () =>
    | Pick<AppleSubscriptionSource, 'read'>
    | Promise<Pick<AppleSubscriptionSource, 'read'>>;
  provider: 'all' | 'stripe' | 'apple' | 'google_mock' | 'none';
  dryRun: boolean;
  userId?: string;
  runId?: string;
  now?: () => Date;
  signal?: AbortSignal;
  pageSize?: number;
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

/**
 * Repair missed notifications by discovering provider state and queuing refreshes.
 * Discovery only identifies work: the worker rereads and validates current state
 * before committing through the same path used for notifications.
 */
export async function runLocalReconciliation(
  options: LocalReconciliationOptions,
) {
  const { local, log, dryRun, enqueue } = options;
  // Jobs keep the same ID within a run for deduplication. A later run needs a
  // fresh ID so an earlier completion marker cannot suppress a new refresh.
  const runId = options.runId ?? randomUUID();
  const clock = options.now ?? (() => new Date());
  const summary = { runId, users: 0, queued: 0, discrepancies: 0, failed: 0 };
  const failure = (userId: string, provider: string, error: unknown) => {
    summary.failed++;
    log.error({
      event: 'reconciliation.failed',
      runId,
      userId,
      provider,
      code:
        error instanceof ProcessingError
          ? error.code
          : 'provider_or_storage_unavailable',
    });
  };

  for await (const userId of users(options)) {
    if (options.signal?.aborted) {
      break;
    }

    if (!userId) {
      summary.failed++;
      log.error({ event: 'reconciliation.invalid_profile', runId });
      continue;
    }

    summary.users++;
    let aggregate;
    try {
      aggregate = await local.loadUser(userId);
      if (expirationDue(aggregate, clock())) {
        summary.discrepancies++;
        log.info({
          event: 'reconciliation.expiration_due',
          runId,
          userId,
          dryRun,
        });
        if (!dryRun) {
          await enqueue({
            provider: 'local_expiration',
            eventType: 'expiration',
            eventId: `expire_${runId}_${userId}`,
            userId,
            correlationId: runId,
            receivedAt: clock().toISOString(),
          });
          summary.queued++;
        }
      }
    } catch (error) {
      failure(userId, 'local_expiration', error);
      continue;
    }

    if (options.provider === 'all' || options.provider === 'stripe') {
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
        if (mapping?.customerId) {
          if (
            mapping.userId !== userId ||
            !z
              .string()
              .regex(/^cus_[A-Za-z0-9]+$/)
              .safeParse(mapping.customerId).success
          ) {
            throw new ProcessingError('customer_owner_mismatch');
          }

          const credentials = await options.stripe();
          const rows = await reconcileStripeSubscriptions({
            ...credentials,
            store: local.store,
            userId,
            customerId: mapping.customerId as string,
            dryRun,
            runId,
            now: clock,
            ...(options.signal ? { signal: options.signal } : {}),
            enqueue: async (job) => {
              await enqueue(job);
              summary.queued++;
            },
          });
          for (const row of rows) {
            if (row.result.startsWith('failed:')) {
              summary.failed++;
            }

            if (row.result.startsWith('would ')) {
              summary.discrepancies++;
            }

            log.info({
              event: 'reconciliation.stripe',
              runId,
              userId,
              subscriptionId: row.subscription,
              result: row.result,
            });
          }
        } else if (
          aggregate.subscriptions.some((s) => s.provider === 'stripe')
        ) {
          throw new ProcessingError('customer_owner_missing');
        }
      } catch (error) {
        failure(userId, 'stripe', error);
      }
    }

    if (options.provider === 'all' || options.provider === 'apple') {
      // Known lineages are enough for status lookup. Unlike Stripe discovery,
      // this cannot recover a purchase that never reached our database at all.
      let source: Pick<AppleSubscriptionSource, 'read'> | undefined;
      for (const previous of aggregate.subscriptions.filter(
        (subscription) => subscription.provider === 'apple',
      )) {
        if (options.signal?.aborted) {
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
            eventId: `reconcile_${runId}_${originalId}`,
            transactionId: originalId,
            userId,
            correlationId: runId,
            receivedAt: clock().toISOString(),
          });
          // No known Apple subscriptions means no Apple credentials are loaded.
          source ??= await options.apple();
          const { subscription } = await source.read(
            job,
            aggregate.subscriptions,
            clock(),
          );
          if (options.signal?.aborted) {
            break;
          }

          const changed = !sameDomainState(previous, subscription);
          if (changed) {
            summary.discrepancies++;
          }

          // Preview never finishes transactions. The worker verifies again after
          // queue delivery and commits before finishing the current transaction.
          if (!dryRun) {
            await enqueue(job);
            summary.queued++;
          }

          log.info({
            event: 'reconciliation.apple',
            runId,
            userId,
            subscriptionId: previous.providerSubscriptionId,
            result: dryRun
              ? changed
                ? 'would update'
                : 'unchanged'
              : 'queued',
          });
        } catch (error) {
          failure(userId, 'apple', error);
        }
      }
    }

    if (options.provider === 'all' || options.provider === 'google_mock') {
      try {
        const source = new GoogleMockSource(
          local.documentClient,
          local.tableName,
        );
        const ids = new Set(
          aggregate.subscriptions
            .filter(
              (s) =>
                s.provider === 'google_mock' &&
                s.providerSubscriptionId.startsWith('mock_google_'),
            )
            .map((s) => s.providerSubscriptionId),
        );
        for await (const state of source.list(userId)) {
          ids.add(state.subscriptionId);
        }

        for (const subscriptionId of ids) {
          if (options.signal?.aborted) {
            break;
          }

          try {
            const state = await source.read(userId, subscriptionId);
            if (!state) {
              throw new ProcessingError('google_mock_state_missing');
            }

            const previous = aggregate.subscriptions.find(
              (s) =>
                s.provider === 'google_mock' &&
                s.providerSubscriptionId === subscriptionId,
            );
            const changed =
              !previous ||
              !sameDomainState(
                previous,
                normalizeGoogleMock(state, previous, clock()),
              );
            if (changed) {
              summary.discrepancies++;
            }

            // Queue even an unchanged preview: provider state or an access
            // boundary can change before processing. Dry-run performs no writes.
            if (!dryRun) {
              await enqueue({
                provider: 'google_mock',
                eventType: 'reconciliation',
                eventId: `reconcile_${runId}_${subscriptionId}`,
                userId,
                subscriptionId,
                correlationId: runId,
                receivedAt: clock().toISOString(),
              });
              summary.queued++;
            }

            log.info({
              event: 'reconciliation.google_mock',
              runId,
              userId,
              subscriptionId,
              result: dryRun
                ? changed
                  ? 'would update'
                  : 'unchanged'
                : 'queued',
            });
          } catch (error) {
            failure(userId, 'google_mock', error);
          }
        }
      } catch (error) {
        failure(userId, 'google_mock', error);
      }
    }
  }

  log.info({ event: 'reconciliation.completed', dryRun, ...summary });
  return summary;
}

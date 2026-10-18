import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { deriveEntitlements, type Subscription } from '@premiumpass/domain';
import { DynamoDbSubscriptionStore } from '@premiumpass/persistence';
import {
  ProcessingError,
  RevisionConflict,
  type Aggregate,
} from './contracts.js';

export type TransactionWrite = NonNullable<
  TransactWriteCommandInput['TransactItems']
>[number];

export class DynamoDbProcessingStore {
  /** Use an existing document client and table; resource creation is external. */
  constructor(
    readonly client: DynamoDBDocumentClient,
    readonly tableName: string,
  ) {}

  /** Read one committed item by key; return undefined only for absence. */
  async get(pk: string, sk: string) {
    return (
      await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk, sk },
          ConsistentRead: true,
        }),
      )
    ).Item;
  }

  /**
   * Load the user's revision, provider subscriptions, and admin grant for a guarded write.
   * Missing aggregate state starts at revision zero; malformed state throws.
   */
  async load(userId: string): Promise<Aggregate> {
    // Revision first: a write during the subsequent query invalidates our commit.
    // Consistent reads alone do not make multiple reads a transaction; the later
    // revision condition detects changes by writers using this shared path.
    const item = await this.get(`USER#${userId}`, 'ENTITLEMENTS');
    const revision = item
      ? z.number().int().positive().parse(item.revision)
      : 0;
    if (item && item.userId !== userId) {
      throw new ProcessingError('aggregate_owner_mismatch');
    }

    const reader = new DynamoDbSubscriptionStore(this.client, this.tableName);
    const subscriptions = await reader.listForUser(userId);
    const adminGrant = await reader.getAdminGrant(userId);
    return {
      userId,
      revision,
      subscriptions,
      adminGrant,
      effectiveUntil: item
        ? z.iso.datetime().nullable().parse(item.effectiveUntil)
        : null,
    };
  }

  /** Replace only this provider subscription; preserve every other grant. */
  async commitSubscription(
    aggregate: Aggregate,
    subscription: Subscription,
    writes: TransactionWrite[],
    now: Date,
    event?: { eventId: string; correlationId: string },
  ) {
    const subscriptions = aggregate.subscriptions.filter(
      (existing) =>
        existing.provider !== subscription.provider ||
        existing.providerSubscriptionId !== subscription.providerSubscriptionId,
    );
    subscriptions.push(subscription);
    await this.commit(aggregate, subscriptions, writes, now, event);
  }

  /**
   * Shared transaction path for provider processing and local subscription scenarios.
   * Atomically apply the caller's writes, recompute access at now and advance the
   * aggregate revision; optional event metadata adds a pending outbox entry.
   * Require an existing profile and the loaded revision. Concurrency conflicts
   * throw RevisionConflict; other transaction failures expose only a safe code.
   */
  async commit(
    aggregate: Aggregate,
    subscriptions: Subscription[],
    writes: TransactionWrite[],
    now: Date,
    event?: { eventId: string; correlationId: string },
    adminGrant = aggregate.adminGrant,
  ) {
    const { userId, revision } = aggregate;
    const entitlements = deriveEntitlements(subscriptions, now, adminGrant);
    // Aggregate revision serializes all writers for this user. A SUB source
    // revision changes only when that individual subscription changes.
    const nextRevision = revision + 1;
    const domainEventId = `${userId}:${nextRevision}`;
    const items: TransactionWrite[] = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `USER#${userId}`,
            sk: 'ENTITLEMENTS',
            userId,
            revision: nextRevision,
            ...entitlements,
          },
          // Compare-and-swap (CAS): commit only if nobody has advanced the
          // revision since load(). A conflict rolls back every item in this write.
          ConditionExpression:
            revision === 0
              ? 'attribute_not_exists(pk)'
              : 'revision = :revision',
          ...(revision
            ? { ExpressionAttributeValues: { ':revision': revision } }
            : {}),
        },
      },
      {
        ConditionCheck: {
          TableName: this.tableName,
          Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
          ConditionExpression: 'userId = :user',
          ExpressionAttributeValues: { ':user': userId },
        },
      },
      ...writes,
      // Save publication intent with state to close the save-then-publish crash
      // window. The separate outbox publisher sends pending entries; API access
      // never waits for publication or downstream consumers.
      ...(event
        ? [
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  pk: `OUTBOX#${domainEventId}`,
                  sk: 'EVENT',
                  domainEventId,
                  userId,
                  revision: nextRevision,
                  type: 'SubscriptionChanged',
                  status: 'pending',
                  providerEventId: event.eventId,
                  correlationId: event.correlationId,
                  createdAt: now.toISOString(),
                  entitlements,
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
          ]
        : []),
    ];
    try {
      await this.client.send(
        new TransactWriteCommand({ TransactItems: items }),
      );
    } catch (error) {
      // Item zero is deliberately the aggregate revision guard. Ownership and
      // profile condition failures are not ordinary optimistic-lock conflicts.
      if (
        error instanceof TransactionCanceledException &&
        (error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed' ||
          error.CancellationReasons?.some(
            (reason) => reason.Code === 'TransactionConflict',
          ))
      ) {
        throw new RevisionConflict();
      }

      // Do not include AWS cancellation item images or payloads in logs.
      throw new ProcessingError('transaction_failed');
    }
  }
}

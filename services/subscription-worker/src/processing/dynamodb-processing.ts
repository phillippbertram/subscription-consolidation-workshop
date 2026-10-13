import type { AppleJob, StripeJob } from '@premiumpass/billing-contracts';
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

type Write = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

export class DynamoDbProcessingStore {
  /** Use an existing document client and table; resource creation is external. */
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  /** Read one committed item by key; return undefined only for absence. */
  private async get(pk: string, sk: string) {
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

  /** Check the durable event marker without reserving or completing the event. */
  async isProcessed(eventId: string) {
    return Boolean(await this.get(`EVENT#stripe#${eventId}`, 'PROCESSED'));
  }

  /** Resolve the existing customer owner; absent or inconsistent mappings throw. */
  async owner(customerId: string) {
    // Resolve ownership from checkout-created mappings, not event metadata.
    // Both directions must agree before we select a user partition.
    const record = await this.get(
      `PROVIDER#stripe#CUSTOMER#${customerId}`,
      'OWNER',
    );
    if (
      !record ||
      record.customerId !== customerId ||
      !z.uuid().safeParse(record.userId).success
    ) {
      throw new ProcessingError('customer_owner_missing');
    }
    const forward = await this.get(`USER#${record.userId}`, 'CUSTOMER#stripe');
    if (
      forward?.customerId !== customerId ||
      forward.userId !== record.userId
    ) {
      throw new ProcessingError('customer_owner_mismatch');
    }
    return record.userId as string;
  }

  /**
   * Load the user's revision and all provider subscriptions for a guarded write.
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
    if (item && item.userId !== userId)
      throw new ProcessingError('aggregate_owner_mismatch');
    const subscriptions = await new DynamoDbSubscriptionStore(
      this.client,
      this.tableName,
    ).listForUser(userId);
    return { userId, revision, subscriptions };
  }

  /**
   * Replace one Stripe subscription while preserving every other provider grant.
   * Recheck ownership and atomically save access, owner binding and completion;
   * changed controls whether the same transaction also creates an outbox event.
   * Propagate failures so the processor can check completion or retry.
   */
  async commitStripe(
    aggregate: Aggregate,
    subscription: Subscription,
    customerId: string,
    job: StripeJob,
    now: Date,
    changed: boolean,
  ) {
    const userId = aggregate.userId;
    const ownership = (
      pk: string,
      sk: string,
      condition: string,
      values: Record<string, string>,
    ): Write => ({
      ConditionCheck: {
        TableName: this.tableName,
        Key: { pk, sk },
        ConditionExpression: condition,
        ExpressionAttributeValues: values,
      },
    });
    // Recheck ownership inside the transaction: mappings could have changed
    // while provider requests were in flight after the earlier reads.
    const extra: Write[] = [
      ownership(
        `USER#${userId}`,
        'CUSTOMER#stripe',
        'userId = :user AND customerId = :customer',
        { ':user': userId, ':customer': customerId },
      ),
      ownership(
        `PROVIDER#stripe#CUSTOMER#${customerId}`,
        'OWNER',
        'userId = :user AND customerId = :customer',
        { ':user': userId, ':customer': customerId },
      ),
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `PROVIDER#stripe#SUB#${subscription.providerSubscriptionId}`,
            sk: 'OWNER',
            userId,
            customerId,
          },
          // Create or confirm the binding, but never reassign a subscription
          // to another user/customer because an incoming event suggests it.
          ConditionExpression:
            'attribute_not_exists(pk) OR (userId = :user AND customerId = :customer)',
          ExpressionAttributeValues: {
            ':user': userId,
            ':customer': customerId,
          },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `USER#${userId}`,
            sk: `SUB#stripe#${subscription.providerSubscriptionId}`,
            ...subscription,
          },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            // This marker commits with state. Saving it earlier could make a
            // failed update appear complete and suppress all future retries.
            pk: `EVENT#stripe#${job.eventId}`,
            sk: 'PROCESSED',
            userId,
            eventId: job.eventId,
            eventType: job.eventType,
            correlationId: job.correlationId,
            processedAt: now.toISOString(),
            outcome: changed ? 'changed' : 'verified',
            revision: aggregate.revision + 1,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];
    // Replace only this subscription and keep every other provider grant.
    // Ending Stripe access must not erase a still-valid Apple/Google grant.
    const subscriptions = aggregate.subscriptions.filter(
      (s) =>
        !(
          s.provider === 'stripe' &&
          s.providerSubscriptionId === subscription.providerSubscriptionId
        ),
    );
    subscriptions.push(subscription);
    await this.commit(
      aggregate,
      subscriptions,
      extra,
      now,
      changed ? job : undefined,
    );
  }

  async isAppleProcessed(job: AppleJob) {
    const item = await this.get(
      `EVENT#apple#Sandbox#${job.eventId}`,
      'PROCESSED',
    );
    if (
      item &&
      (item.userId !== job.userId || item.transactionId !== job.transactionId)
    )
      throw new ProcessingError('apple_event_owner_mismatch');
    return Boolean(item);
  }

  async commitApple(
    aggregate: Aggregate,
    subscription: Subscription,
    job: AppleJob,
    now: Date,
    changed: boolean,
  ) {
    if (
      aggregate.userId !== job.userId ||
      subscription.userId !== job.userId ||
      subscription.provider !== 'apple'
    )
      throw new ProcessingError('apple_owner_mismatch');
    const writes: Write[] = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `PROVIDER#apple#SUB#${subscription.providerSubscriptionId}`,
            sk: 'OWNER',
            userId: job.userId,
          },
          ConditionExpression: 'attribute_not_exists(pk) OR userId = :user',
          ExpressionAttributeValues: { ':user': job.userId },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `USER#${job.userId}`,
            sk: `SUB#apple#${subscription.providerSubscriptionId}`,
            ...subscription,
          },
        },
      },
      {
        Put: {
          TableName: this.tableName,
          Item: {
            pk: `EVENT#apple#Sandbox#${job.eventId}`,
            sk: 'PROCESSED',
            userId: job.userId,
            transactionId: job.transactionId,
            eventId: job.eventId,
            eventType: job.eventType,
            correlationId: job.correlationId,
            processedAt: now.toISOString(),
            outcome: changed ? 'changed' : 'verified',
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];
    const subscriptions = aggregate.subscriptions.filter(
      (s) =>
        !(
          s.provider === 'apple' &&
          s.providerSubscriptionId === subscription.providerSubscriptionId
        ),
    );
    subscriptions.push(subscription);
    await this.commit(
      aggregate,
      subscriptions,
      writes,
      now,
      changed ? { ...job, eventId: `apple:Sandbox:${job.eventId}` } : undefined,
    );
  }

  /**
   * Shared transaction path for Stripe processing and local subscription scenarios.
   * Atomically apply the caller's writes, recompute access at now and advance the
   * aggregate revision; optional event metadata adds a pending outbox entry.
   * Require an existing profile and the loaded revision. Concurrency conflicts
   * throw RevisionConflict; other transaction failures expose only a safe code.
   */
  async commit(
    aggregate: Aggregate,
    subscriptions: Subscription[],
    writes: Write[],
    now: Date,
    event?: { eventId: string; correlationId: string },
  ) {
    const { userId, revision } = aggregate;
    const entitlements = deriveEntitlements(subscriptions, now);
    // Aggregate revision serializes all writers for this user. A SUB source
    // revision changes only when that individual subscription changes.
    const nextRevision = revision + 1;
    const domainEventId = `${userId}:${nextRevision}`;
    const items: Write[] = [
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
      // window. P08 will publish pending entries; API access never waits for it.
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

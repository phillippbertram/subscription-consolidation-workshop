import { z } from 'zod';
import type { Subscription } from '@premiumpass/domain';
import { ProcessingError, type Aggregate } from '../../processing/contracts.js';
import type {
  DynamoDbProcessingStore,
  TransactionWrite,
} from '../../processing/dynamodb-processing.js';
import type {
  StripeProcessingJob,
  StripeProcessingStore,
} from './contracts.js';

/** Stripe ownership, subscription writes, and durable processing markers. */
export class DynamoDbStripeStore implements StripeProcessingStore {
  constructor(private readonly aggregates: DynamoDbProcessingStore) {}

  load(userId: string) {
    return this.aggregates.load(userId);
  }

  /** Check the durable event marker without reserving or completing the event. */
  async isProcessed(eventId: string) {
    return Boolean(
      await this.aggregates.get(`EVENT#stripe#${eventId}`, 'PROCESSED'),
    );
  }

  /** Resolve the existing customer owner; absent or inconsistent mappings throw. */
  async owner(customerId: string) {
    // Resolve ownership from checkout-created mappings, not event metadata.
    // Both directions must agree before we select a user partition.
    const record = await this.aggregates.get(
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

    const forward = await this.aggregates.get(
      `USER#${record.userId}`,
      'CUSTOMER#stripe',
    );
    if (
      forward?.customerId !== customerId ||
      forward.userId !== record.userId
    ) {
      throw new ProcessingError('customer_owner_mismatch');
    }

    return record.userId as string;
  }

  /**
   * Replace one Stripe subscription while preserving every other provider grant.
   * Recheck ownership and atomically save access, owner binding and completion;
   * changed controls whether the same transaction also creates an outbox event.
   * Propagate failures so the processor can check completion or retry.
   */
  async commit(
    aggregate: Aggregate,
    subscription: Subscription,
    customerId: string,
    job: StripeProcessingJob,
    now: Date,
    changed: boolean,
  ) {
    const userId = aggregate.userId;
    const ownership = (
      pk: string,
      sk: string,
      condition: string,
      values: Record<string, string>,
    ): TransactionWrite => ({
      ConditionCheck: {
        TableName: this.aggregates.tableName,
        Key: { pk, sk },
        ConditionExpression: condition,
        ExpressionAttributeValues: values,
      },
    });
    // Recheck ownership inside the transaction: mappings could have changed
    // while provider requests were in flight after the earlier reads.
    const extra: TransactionWrite[] = [
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
          TableName: this.aggregates.tableName,
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
          TableName: this.aggregates.tableName,
          Item: {
            pk: `USER#${userId}`,
            sk: `SUB#stripe#${subscription.providerSubscriptionId}`,
            ...subscription,
          },
        },
      },
      {
        Put: {
          TableName: this.aggregates.tableName,
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
    await this.aggregates.commitSubscription(
      aggregate,
      subscription,
      extra,
      now,
      changed ? job : undefined,
    );
  }
}

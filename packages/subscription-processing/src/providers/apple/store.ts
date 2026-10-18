import { z } from 'zod';
import type { Subscription } from '@premiumpass/domain';
import { ProcessingError, type Aggregate } from '../../processing/contracts.js';
import type {
  DynamoDbProcessingStore,
  TransactionWrite,
} from '../../processing/dynamodb-processing.js';
import type { AppleProcessingJob } from '@premiumpass/billing-contracts';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

/** Apple ownership, subscription writes, and durable processing markers. */
export class DynamoDbAppleStore {
  constructor(private readonly aggregates: DynamoDbProcessingStore) {}

  load(userId: string) {
    return this.aggregates.load(userId);
  }

  async getProcessing(job: AppleProcessingJob) {
    const item = await this.aggregates.get(
      `EVENT#apple#Sandbox#${job.eventId}`,
      'PROCESSED',
    );
    if (!item) {
      return undefined;
    }

    if (
      item.userId !== job.userId ||
      item.transactionId !== job.transactionId ||
      item.eventType !== job.eventType
    ) {
      throw new ProcessingError('apple_event_owner_mismatch');
    }

    const processing = z
      .object({
        finishTransactionId: z.string().regex(/^[0-9]{1,64}$/),
        finishedAt: z.iso.datetime().optional(),
      })
      .safeParse(item);
    if (!processing.success) {
      throw new ProcessingError('apple_processing_marker_invalid');
    }

    return processing.data;
  }

  async markFinished(
    job: AppleProcessingJob,
    transactionId: string,
    now: Date,
  ) {
    await this.aggregates.client.send(
      new UpdateCommand({
        TableName: this.aggregates.tableName,
        Key: { pk: `EVENT#apple#Sandbox#${job.eventId}`, sk: 'PROCESSED' },
        UpdateExpression: 'SET finishedAt = if_not_exists(finishedAt, :now)',
        ConditionExpression:
          'userId = :user AND transactionId = :submitted AND eventType = :type AND finishTransactionId = :finished',
        ExpressionAttributeValues: {
          ':user': job.userId,
          ':submitted': job.transactionId,
          ':type': job.eventType,
          ':finished': transactionId,
          ':now': now.toISOString(),
        },
      }),
    );
  }

  async commit(
    aggregate: Aggregate,
    subscription: Subscription,
    job: AppleProcessingJob,
    now: Date,
    changed: boolean,
    finishTransactionId: string,
  ) {
    if (
      aggregate.userId !== job.userId ||
      subscription.userId !== job.userId ||
      subscription.provider !== 'apple'
    ) {
      throw new ProcessingError('apple_owner_mismatch');
    }

    const writes: TransactionWrite[] = [
      {
        Put: {
          TableName: this.aggregates.tableName,
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
          TableName: this.aggregates.tableName,
          Item: {
            pk: `USER#${job.userId}`,
            sk: `SUB#apple#${subscription.providerSubscriptionId}`,
            ...subscription,
          },
        },
      },
      {
        Put: {
          TableName: this.aggregates.tableName,
          Item: {
            pk: `EVENT#apple#Sandbox#${job.eventId}`,
            sk: 'PROCESSED',
            userId: job.userId,
            transactionId: job.transactionId,
            finishTransactionId,
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
    await this.aggregates.commitSubscription(
      aggregate,
      subscription,
      writes,
      now,
      changed ? { ...job, eventId: `apple:Sandbox:${job.eventId}` } : undefined,
    );
  }
}

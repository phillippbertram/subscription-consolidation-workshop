import { z } from 'zod';
import type { Subscription } from '@premiumpass/domain';
import { ProcessingError, type Aggregate } from '../../processing/contracts.js';
import type {
  DynamoDbProcessingStore,
  TransactionWrite,
} from '../../processing/dynamodb-processing.js';
import type { GoogleJob } from '@premiumpass/billing-contracts';
import { googleSubscriptionId } from '@premiumpass/google-play/contracts';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

/** Google ownership, subscription writes, and durable processing markers. */
export class DynamoDbGoogleStore {
  constructor(private readonly aggregates: DynamoDbProcessingStore) {}

  load(userId: string) {
    return this.aggregates.load(userId);
  }

  async getProcessing(job: GoogleJob) {
    const item = await this.aggregates.get(
      `EVENT#google#${job.eventId}`,
      'PROCESSED',
    );
    if (!item) {
      return undefined;
    }

    const id = googleSubscriptionId(
      { packageName: job.packageName },
      job.purchaseToken,
    );
    const parsed = z
      .object({
        userId: z.uuid(),
        needsAcknowledgement: z.boolean(),
        completedAt: z.iso.datetime().optional(),
      })
      .safeParse(item);
    if (
      !parsed.success ||
      item.subscriptionId !== id ||
      item.eventType !== job.eventType ||
      (job.userId && item.userId !== job.userId)
    ) {
      throw new ProcessingError('google_event_owner_mismatch');
    }

    return parsed.data;
  }

  async markCompleted(job: GoogleJob, userId: string, now: Date) {
    await this.aggregates.client.send(
      new UpdateCommand({
        TableName: this.aggregates.tableName,
        Key: { pk: `EVENT#google#${job.eventId}`, sk: 'PROCESSED' },
        UpdateExpression: 'SET completedAt = if_not_exists(completedAt, :now)',
        ConditionExpression:
          'userId = :user AND subscriptionId = :id AND eventType = :type',
        ExpressionAttributeValues: {
          ':user': userId,
          ':id': googleSubscriptionId(
            { packageName: job.packageName },
            job.purchaseToken,
          ),
          ':type': job.eventType,
          ':now': now.toISOString(),
        },
      }),
    );
  }

  async commit(
    aggregate: Aggregate,
    subscription: Subscription,
    job: GoogleJob,
    now: Date,
    changed: boolean,
    needsAcknowledgement: boolean,
  ) {
    if (
      subscription.provider !== 'google' ||
      subscription.userId !== aggregate.userId ||
      (job.userId && job.userId !== aggregate.userId)
    ) {
      throw new ProcessingError('google_owner_mismatch');
    }

    const userId = aggregate.userId;
    const subscriptionId = subscription.providerSubscriptionId;
    const writes: TransactionWrite[] = [
      {
        Put: {
          TableName: this.aggregates.tableName,
          Item: {
            pk: `PROVIDER#google#SUB#${subscriptionId}`,
            sk: 'OWNER',
            userId,
            purchaseToken: job.purchaseToken,
            packageName: job.packageName,
          },
          ConditionExpression:
            'attribute_not_exists(pk) OR (userId = :user AND purchaseToken = :token)',
          ExpressionAttributeValues: {
            ':user': userId,
            ':token': job.purchaseToken,
          },
        },
      },
      {
        Put: {
          TableName: this.aggregates.tableName,
          Item: {
            pk: `USER#${userId}`,
            sk: `SUB#google#${subscriptionId}`,
            ...subscription,
          },
        },
      },
      {
        Put: {
          TableName: this.aggregates.tableName,
          Item: {
            pk: `EVENT#google#${job.eventId}`,
            sk: 'PROCESSED',
            userId,
            subscriptionId,
            eventType: job.eventType,
            needsAcknowledgement,
            processedAt: now.toISOString(),
            correlationId: job.correlationId,
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
      changed ? { ...job, eventId: `google:${job.eventId}` } : undefined,
    );
  }
}

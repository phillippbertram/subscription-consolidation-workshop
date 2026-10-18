import type { GoogleMockJob } from '@premiumpass/billing-contracts';
import type { Subscription } from '@premiumpass/domain';
import { ProcessingError, type Aggregate } from '../../processing/contracts.js';
import type { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { mockKey, type GoogleMockState } from './source.js';

/** Persist derived mock access only while source revision and owner still match. */
export class DynamoDbGoogleMockStore {
  constructor(private readonly aggregates: DynamoDbProcessingStore) {}

  load(userId: string) {
    return this.aggregates.load(userId);
  }

  async isProcessed(job: GoogleMockJob) {
    const item = await this.aggregates.get(
      `EVENT#google_mock#${job.eventId}`,
      'PROCESSED',
    );
    if (
      item &&
      (item.userId !== job.userId || item.subscriptionId !== job.subscriptionId)
    ) {
      throw new ProcessingError('google_mock_owner_mismatch');
    }

    return Boolean(item);
  }

  async commit(
    aggregate: Aggregate,
    subscription: Subscription,
    state: GoogleMockState,
    job: GoogleMockJob,
    now: Date,
    changed: boolean,
  ) {
    await this.aggregates.commitSubscription(
      aggregate,
      subscription,
      [
        {
          ConditionCheck: {
            TableName: this.aggregates.tableName,
            Key: mockKey(job.userId, job.subscriptionId),
            ConditionExpression: 'userId = :user AND revision = :revision',
            ExpressionAttributeValues: {
              ':user': job.userId,
              ':revision': state.revision,
            },
          },
        },
        {
          ConditionCheck: {
            TableName: this.aggregates.tableName,
            Key: {
              pk: `PROVIDER#google_mock#SUB#${job.subscriptionId}`,
              sk: 'OWNER',
            },
            ConditionExpression: 'userId = :user',
            ExpressionAttributeValues: { ':user': job.userId },
          },
        },
        {
          Put: {
            TableName: this.aggregates.tableName,
            Item: {
              pk: `USER#${job.userId}`,
              sk: `SUB#google_mock#${job.subscriptionId}`,
              ...subscription,
            },
          },
        },
        {
          Put: {
            TableName: this.aggregates.tableName,
            Item: {
              pk: `EVENT#google_mock#${job.eventId}`,
              sk: 'PROCESSED',
              userId: job.userId,
              subscriptionId: job.subscriptionId,
              processedAt: now.toISOString(),
              correlationId: job.correlationId,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
      now,
      changed ? job : undefined,
    );
  }
}

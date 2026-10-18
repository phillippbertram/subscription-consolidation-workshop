import { setTimeout } from 'node:timers/promises';
import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ExpirationJob } from '@premiumpass/billing-contracts';
import type { DynamoDbProcessingStore } from './dynamodb-processing.js';
import {
  expirationDue,
  ProcessingError,
  RevisionConflict,
} from './contracts.js';

// Keep the stored snapshot and downstream events up to date when time passes
// without a provider notification. API reads already enforce expiration, so a
// delayed timer does not extend access while this background job catches up.
export class ExpirationProcessor {
  constructor(
    private readonly store: DynamoDbProcessingStore,
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: ExpirationJob) {
    const key = {
      pk: `EVENT#local_expiration#${job.eventId}`,
      sk: 'PROCESSED',
    };
    const completed = async () => {
      const item = (
        await this.client.send(
          new GetCommand({
            TableName: this.tableName,
            Key: key,
            ConsistentRead: true,
          }),
        )
      ).Item;
      if (item && item.userId !== job.userId) {
        throw new ProcessingError('expiration_owner_mismatch');
      }

      return Boolean(item);
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (await completed()) {
        return { outcome: 'duplicate' };
      }

      const aggregate = await this.store.load(job.userId);
      const now = this.now();
      if (!expirationDue(aggregate, now)) {
        return { outcome: 'not_due' };
      }

      try {
        // Recompute the snapshot only. Do not invent a provider status, erase
        // a subscription, or change verifiedAt/accessUntil on a timer.
        await this.store.commit(
          aggregate,
          aggregate.subscriptions,
          [
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  ...key,
                  userId: job.userId,
                  eventId: job.eventId,
                  processedAt: now.toISOString(),
                },
                ConditionExpression: 'attribute_not_exists(pk)',
              },
            },
          ],
          now,
          job,
        );
        return {
          outcome: 'expired',
          domainEventId: `${job.userId}:${aggregate.revision + 1}`,
        };
      } catch (error) {
        if (await completed()) {
          return { outcome: 'duplicate' };
        }

        if (!(error instanceof RevisionConflict)) {
          throw error;
        }

        await setTimeout(25 + Math.random() * 75);
      }
    }

    throw new ProcessingError('concurrency_retry_exhausted');
  }
}

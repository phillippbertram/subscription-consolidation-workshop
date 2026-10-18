import { setTimeout } from 'node:timers/promises';
import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { GoogleMockJob } from '@premiumpass/billing-contracts';
import {
  GoogleMockSource,
  mockKey,
  normalizeGoogleMock,
} from './google-mock-source.js';
import { expirationDue, ProcessingError } from './contracts.js';
import { sameDomainState } from './normalize.js';
import type { DynamoDbProcessingStore } from './dynamodb-processing.js';

export class GoogleMockProcessor {
  constructor(
    private readonly store: DynamoDbProcessingStore,
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async process(job: GoogleMockJob) {
    const key = { pk: `EVENT#google_mock#${job.eventId}`, sk: 'PROCESSED' };
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
      if (
        item &&
        (item.userId !== job.userId ||
          item.subscriptionId !== job.subscriptionId)
      ) {
        throw new ProcessingError('google_mock_owner_mismatch');
      }

      return Boolean(item);
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (await completed()) {
        return { outcome: 'duplicate' };
      }

      const aggregate = await this.store.load(job.userId);
      const state = await new GoogleMockSource(
        this.client,
        this.tableName,
      ).read(job.userId, job.subscriptionId);
      if (!state) {
        throw new ProcessingError('google_mock_state_missing');
      }

      const now = this.now();
      const previous = aggregate.subscriptions.find(
        (s) =>
          s.provider === 'google_mock' &&
          s.providerSubscriptionId === job.subscriptionId,
      );
      const subscription = normalizeGoogleMock(state, previous, now);
      const changed =
        !previous ||
        !sameDomainState(previous, subscription) ||
        expirationDue(aggregate, now);
      const subscriptions = aggregate.subscriptions.filter(
        (s) =>
          !(
            s.provider === 'google_mock' &&
            s.providerSubscriptionId === job.subscriptionId
          ),
      );
      subscriptions.push(subscription);
      try {
        await this.store.commit(
          aggregate,
          subscriptions,
          [
            {
              ConditionCheck: {
                TableName: this.tableName,
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
                TableName: this.tableName,
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
                TableName: this.tableName,
                Item: {
                  pk: `USER#${job.userId}`,
                  sk: `SUB#google_mock#${job.subscriptionId}`,
                  ...subscription,
                },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  ...key,
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
        return { outcome: changed ? 'changed' : 'verified' };
      } catch (error) {
        if (await completed()) {
          return { outcome: 'duplicate' };
        }

        // The independent source revision can change without advancing the
        // aggregate. Retry both kinds of transaction conflict with fresh reads.
        if (
          !(error instanceof ProcessingError) ||
          !['revision_conflict', 'transaction_failed'].includes(error.code)
        ) {
          throw error;
        }

        await setTimeout(25 + Math.random() * 75);
      }
    }

    throw new ProcessingError('google_mock_commit_failed');
  }
}

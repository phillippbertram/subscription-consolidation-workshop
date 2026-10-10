import {
  DynamoDBDocumentClient,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  subscriptionSchema,
  type Subscription,
} from './domain/subscriptions.js';
import type { SubscriptionStore } from './subscriptions.js';

export class DynamoDbSubscriptionStore implements SubscriptionStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async listForUser(userId: string): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];
    let cursor: QueryCommandInput['ExclusiveStartKey'];
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':prefix': 'SUB#',
          },
          ConsistentRead: true,
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const subscription = subscriptionSchema.parse(item);
        if (
          subscription.userId !== userId ||
          item.pk !== `USER#${userId}` ||
          item.sk !==
            `SUB#${subscription.provider}#${subscription.providerSubscriptionId}`
        ) {
          throw new Error('Subscription ownership or key mismatch.');
        }
        subscriptions.push(subscription);
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    return subscriptions;
  }
}

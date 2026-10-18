import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { subscriptionSchema, type Subscription } from '@premiumpass/domain';
import { adminGrantSchema } from '@premiumpass/domain';
import type { SubscriptionStore } from '@premiumpass/domain';

export class DynamoDbSubscriptionStore implements SubscriptionStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getAdminGrant(userId: string) {
    const key = { pk: `USER#${userId}`, sk: 'ADMIN_GRANT#premium' };
    const { Item: item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
        ConsistentRead: true,
      }),
    );
    if (!item) {
      return null;
    }

    const grant = adminGrantSchema.parse(item);
    if (grant.userId !== userId || item.pk !== key.pk || item.sk !== key.sk) {
      throw new Error('Admin grant ownership or key mismatch.');
    }

    return grant;
  }

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

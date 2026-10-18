import {
  ScanCommand,
  type DynamoDBDocumentClient,
  type ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  googleSubscriptionId,
  purchaseTokenSchema,
} from '@premiumpass/google-play/contracts';

const ownerSchema = z.object({
  pk: z.string(),
  sk: z.literal('OWNER'),
  userId: z.uuid(),
  packageName: z.string(),
  purchaseToken: purchaseTokenSchema,
});

export interface GooglePurchaseReference {
  userId: string;
  subscriptionId: string;
  purchaseToken: string;
}

/** Read known Google purchases without giving discovery any provider credentials. */
export class GoogleReconciliationStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly packageName: string,
  ) {}

  async *list(
    checkTime: () => void,
    pageSize = 100,
  ): AsyncGenerator<GooglePurchaseReference | undefined> {
    let cursor: ScanCommandInput['ExclusiveStartKey'];
    do {
      checkTime();
      // A filtered scan suits the small demo table. The filter is not an IAM
      // boundary or an index: larger deployments need indexed, resumable discovery.
      const page = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          ConsistentRead: true,
          Limit: pageSize,
          FilterExpression: 'begins_with(pk, :prefix) AND sk = :owner',
          ExpressionAttributeValues: {
            ':prefix': `PROVIDER#google#SUB#${this.packageName}:`,
            ':owner': 'OWNER',
          },
          ProjectionExpression: 'pk, sk, userId, packageName, purchaseToken',
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const parsed = ownerSchema.safeParse(item);
        if (!parsed.success || parsed.data.packageName !== this.packageName) {
          yield undefined;
          continue;
        }

        const owner = parsed.data;
        const subscriptionId = googleSubscriptionId(owner, owner.purchaseToken);
        if (owner.pk !== `PROVIDER#google#SUB#${subscriptionId}`) {
          yield undefined;
          continue;
        }

        yield {
          userId: owner.userId,
          subscriptionId,
          purchaseToken: owner.purchaseToken,
        };
      }

      // Empty filtered pages can still have a cursor; do not stop on Items.length.
      cursor = page.LastEvaluatedKey;
    } while (cursor);
  }
}

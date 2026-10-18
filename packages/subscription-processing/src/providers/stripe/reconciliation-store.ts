import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { scanReferences } from '../../reconciliation/scan.js';

const mappingSchema = z.object({
  pk: z.string(),
  sk: z.literal('CUSTOMER#stripe'),
  userId: z.uuid(),
  customerId: z.string().regex(/^cus_[A-Za-z0-9]+$/),
});
export interface StripeCustomerReference {
  userId: string;
  customerId: string;
}

/** Read customer mappings without provider access or database writes. */
export class StripeReconciliationStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async *list(
    checkTime: () => void,
    pageSize = 100,
  ): AsyncGenerator<StripeCustomerReference | undefined> {
    for await (const item of scanReferences(
      this.client,
      {
        TableName: this.tableName,
        ConsistentRead: true,
        Limit: pageSize,
        // An unfinished customer-creation intent has no customerId and is not discoverable yet.
        FilterExpression:
          'begins_with(pk, :prefix) AND sk = :mapping AND attribute_exists(customerId)',
        ExpressionAttributeValues: {
          ':prefix': 'USER#',
          ':mapping': 'CUSTOMER#stripe',
        },
        ProjectionExpression: 'pk, sk, userId, customerId',
      },
      checkTime,
    )) {
      const parsed = mappingSchema.safeParse(item);
      yield parsed.success && parsed.data.pk === `USER#${parsed.data.userId}`
        ? { userId: parsed.data.userId, customerId: parsed.data.customerId }
        : undefined;
    }
  }
}

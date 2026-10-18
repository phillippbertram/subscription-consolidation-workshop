import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { scanReferences } from '../../reconciliation/scan.js';

const ownerSchema = z.object({
  pk: z.string().regex(/^PROVIDER#apple#SUB#Sandbox:[0-9]{1,64}$/),
  sk: z.literal('OWNER'),
  userId: z.uuid(),
});

export interface ApplePurchaseReference {
  userId: string;
  originalTransactionId: string;
}

/** Discover only previously verified Sandbox lineages; never infer ownership from an ID. */
export class AppleReconciliationStore {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async *list(
    checkTime: () => void,
    pageSize = 100,
  ): AsyncGenerator<ApplePurchaseReference | undefined> {
    for await (const item of scanReferences(
      this.client,
      {
        TableName: this.tableName,
        ConsistentRead: true,
        Limit: pageSize,
        FilterExpression: 'begins_with(pk, :prefix) AND sk = :owner',
        ExpressionAttributeValues: {
          ':prefix': 'PROVIDER#apple#SUB#Sandbox:',
          ':owner': 'OWNER',
        },
        ProjectionExpression: 'pk, sk, userId',
      },
      checkTime,
    )) {
      const parsed = ownerSchema.safeParse(item);
      yield parsed.success
        ? {
            userId: parsed.data.userId,
            originalTransactionId: parsed.data.pk.slice(
              'PROVIDER#apple#SUB#Sandbox:'.length,
            ),
          }
        : undefined;
    }
  }
}

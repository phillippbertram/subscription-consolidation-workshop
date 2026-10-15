import {
  createSqsClient,
  LOCAL_SQS_ENDPOINT,
  createDocumentClient,
} from '@premiumpass/aws-clients';
import { randomUUID } from 'node:crypto';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { type DatabaseConfig } from '@premiumpass/persistence';
import { appleJobSchema } from '@premiumpass/billing-contracts';
import { z } from 'zod';
import { CheckoutError } from './contracts.js';

export interface AppleBilling {
  productId: string;
  enqueue(
    userId: string,
    transactionId: string,
    correlationId: string,
  ): Promise<string>;
  completed(userId: string, operationId: string): Promise<boolean>;
}

export function createLocalAppleBilling(
  env: NodeJS.ProcessEnv,
  database: DatabaseConfig,
): AppleBilling | undefined {
  if (!env.APPLE_ENABLED || env.APPLE_ENABLED === 'false') {
    return undefined;
  }

  if (env.APPLE_ENABLED !== 'true') {
    throw new Error('APPLE_ENABLED must be true or false.');
  }

  const productId = z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,255}$/)
    .safeParse(env.APPLE_PRODUCT_ID);
  const queueUrl = env.SUBSCRIPTION_QUEUE_URL;
  if (
    !productId.success ||
    !database.endpoint ||
    !queueUrl ||
    new URL(queueUrl).origin !== LOCAL_SQS_ENDPOINT
  ) {
    throw new Error(
      'Apple local billing requires APPLE_PRODUCT_ID, DynamoDB Local and SUBSCRIPTION_QUEUE_URL at http://127.0.0.1:9324.',
    );
  }

  const client = createDocumentClient(database);
  const sqs = createSqsClient({ local: true, requestTimeout: 3_000 });
  return {
    productId: productId.data,
    async enqueue(userId, transactionId, correlationId) {
      const eventId = randomUUID();
      const job = appleJobSchema.parse({
        provider: 'apple',
        environment: 'Sandbox',
        eventId,
        eventType: 'client.sync',
        userId,
        transactionId,
        correlationId,
        receivedAt: new Date().toISOString(),
      });
      try {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(job),
          }),
        );
      } catch {
        throw new CheckoutError('apple_queue_unavailable', 503);
      }

      return eventId;
    },
    async completed(userId, operationId) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: database.tableName,
          Key: { pk: `EVENT#apple#Sandbox#${operationId}`, sk: 'PROCESSED' },
          ConsistentRead: true,
        }),
      );
      // Do not disclose completion or ownership of another account's operation.
      return Item?.userId === userId && Item.eventType === 'client.sync';
    },
  };
}

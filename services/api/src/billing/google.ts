import { randomUUID } from 'node:crypto';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  createSqsClient,
  createDocumentClient,
  LOCAL_SQS_ENDPOINT,
} from '@premiumpass/aws-clients';
import type { DatabaseConfig } from '@premiumpass/persistence';
import { googleJobSchema } from '@premiumpass/billing-contracts';
import {
  readGoogleSettings,
  type GoogleSettings,
} from '@premiumpass/google-play';
import { CheckoutError } from './contracts.js';

export interface GoogleBilling extends GoogleSettings {
  enqueue(
    userId: string,
    purchaseToken: string,
    correlationId: string,
  ): Promise<string>;
  completed(userId: string, operationId: string): Promise<boolean>;
}

export function createGoogleBilling(
  env: NodeJS.ProcessEnv,
  database: DatabaseConfig,
  local: boolean,
): GoogleBilling | undefined {
  const settings = readGoogleSettings(env);
  if (!settings) {
    return undefined;
  }

  const queueUrl = env.SUBSCRIPTION_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('SUBSCRIPTION_QUEUE_URL is required.');
  }

  const url = new URL(queueUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (local
      ? !database.endpoint || url.origin !== LOCAL_SQS_ENDPOINT
      : database.endpoint || url.protocol !== 'https:' || env.SQS_ENDPOINT)
  ) {
    throw new Error(
      local
        ? 'Google local billing requires DynamoDB Local and an ElasticMQ queue at http://127.0.0.1:9324.'
        : 'Google Lambda billing requires an AWS HTTPS queue URL and no local database or SQS endpoint.',
    );
  }

  const client = createDocumentClient(database);
  const sqs = createSqsClient({ local, requestTimeout: 3000 });
  return {
    ...settings,
    async enqueue(userId, purchaseToken, correlationId) {
      const eventId = randomUUID();
      const job = googleJobSchema.parse({
        provider: 'google',
        environment: 'test',
        eventType: 'client.sync',
        eventId,
        userId,
        purchaseToken,
        packageName: settings.packageName,
        correlationId,
        receivedAt: new Date().toISOString(),
      });
      try {
        const receipt = await sqs.send(
          new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(job),
          }),
        );
        if (!receipt.MessageId) {
          throw new Error('Queue acceptance unconfirmed.');
        }
      } catch {
        throw new CheckoutError('google_queue_unavailable', 503);
      }

      return eventId;
    },
    async completed(userId, operationId) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: database.tableName,
          Key: { pk: `EVENT#google#${operationId}`, sk: 'PROCESSED' },
          ConsistentRead: true,
        }),
      );
      // Operation IDs are not authorization: ownership is checked on every poll.
      return (
        Item?.userId === userId &&
        Item.eventType === 'client.sync' &&
        z.iso.datetime().safeParse(Item.completedAt).success
      );
    },
  };
}

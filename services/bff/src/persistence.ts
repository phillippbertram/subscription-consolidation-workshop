import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DatabaseConfig } from './config.js';
import { DynamoDbBillingStore } from './billing/dynamodb-billing.js';
import { DynamoDbSubscriptionStore } from './dynamodb-subscriptions.js';
import { DynamoDbUserStore } from './dynamodb-users.js';

export function createPersistence(config: DatabaseConfig) {
  const client = new DynamoDBClient({
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 1_000, requestTimeout: 3_000 },
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          region: 'us-east-1',
          // DynamoDB Local requires signed requests, but no real AWS credentials.
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  const documentClient = DynamoDBDocumentClient.from(client);
  return {
    billing: new DynamoDbBillingStore(documentClient, config.tableName),
    users: new DynamoDbUserStore(documentClient, config.tableName),
    subscriptions: new DynamoDbSubscriptionStore(
      documentClient,
      config.tableName,
    ),
  };
}

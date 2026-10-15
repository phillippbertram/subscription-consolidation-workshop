import { createDocumentClient } from '@premiumpass/aws-clients';
import {
  DynamoDbSubscriptionStore,
  type DatabaseConfig,
} from '@premiumpass/persistence';
import { DynamoDbBillingStore } from './billing/dynamodb-billing.js';
import { DynamoDbUserStore } from './dynamodb-users.js';

export function createPersistence(config: DatabaseConfig) {
  const documentClient = createDocumentClient(config);
  return {
    billing: new DynamoDbBillingStore(documentClient, config.tableName),
    users: new DynamoDbUserStore(documentClient, config.tableName),
    subscriptions: new DynamoDbSubscriptionStore(
      documentClient,
      config.tableName,
    ),
  };
}

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { localClientConfig } from './local.js';

interface DynamoDbClientOptions {
  /** Omit for AWS endpoint resolution and the normal credential chain. */
  endpoint?: string;
  maxAttempts?: number;
  requestTimeout?: number;
}

export function createDynamoDbClient(options: DynamoDbClientOptions = {}) {
  return new DynamoDBClient({
    maxAttempts: options.maxAttempts ?? 3,
    requestHandler: {
      connectionTimeout: 1_000,
      requestTimeout: options.requestTimeout ?? 3_000,
    },
    ...(options.endpoint !== undefined
      ? localClientConfig(options.endpoint)
      : {}),
  });
}

export function createDocumentClient(options: DynamoDbClientOptions = {}) {
  const client = createDynamoDbClient(options);
  const documentClient = DynamoDBDocumentClient.from(client);
  // The SDK document wrapper does not close its underlying client. This
  // factory owns both, so expose cleanup through the returned client.
  documentClient.destroy = () => client.destroy();
  return documentClient;
}

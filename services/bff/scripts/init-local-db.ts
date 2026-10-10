import { setTimeout } from 'node:timers/promises';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  type TableDescription,
} from '@aws-sdk/client-dynamodb';

// Deliberately fixed to the Compose database; never use an AWS profile or endpoint.
const tableName = 'premiumpass-local';
const client = new DynamoDBClient({
  endpoint: 'http://127.0.0.1:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  maxAttempts: 1,
  requestHandler: { connectionTimeout: 1_000, requestTimeout: 1_000 },
});

async function initialize() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    let table: TableDescription | undefined;
    try {
      const result = await client.send(
        new DescribeTableCommand({ TableName: tableName }),
      );
      table = result.Table;
    } catch (error) {
      lastError = error;
      if (error instanceof ResourceNotFoundException) {
        try {
          await client.send(
            new CreateTableCommand({
              TableName: tableName,
              AttributeDefinitions: [
                { AttributeName: 'pk', AttributeType: 'S' },
                { AttributeName: 'sk', AttributeType: 'S' },
              ],
              KeySchema: [
                { AttributeName: 'pk', KeyType: 'HASH' },
                { AttributeName: 'sk', KeyType: 'RANGE' },
              ],
              BillingMode: 'PAY_PER_REQUEST',
            }),
          );
          console.info(`Created local table ${tableName}.`);
        } catch (creationError) {
          // Another startup may have created the table while we were waiting.
          if (!(creationError instanceof ResourceInUseException))
            throw creationError;
        }
      } else if (
        !(error instanceof Error) ||
        (!['ECONNREFUSED', 'ECONNRESET', 'TimeoutError'].includes(error.name) &&
          !['ECONNREFUSED', 'ECONNRESET'].includes(
            'code' in error ? String(error.code) : '',
          ))
      ) {
        throw error;
      }
    }

    if (table?.TableStatus === 'ACTIVE') {
      const keys = table.KeySchema ?? [];
      const attributes = table.AttributeDefinitions ?? [];
      if (
        keys.length !== 2 ||
        !keys.some(
          (key) => key.AttributeName === 'pk' && key.KeyType === 'HASH',
        ) ||
        !keys.some(
          (key) => key.AttributeName === 'sk' && key.KeyType === 'RANGE',
        ) ||
        !['pk', 'sk'].every((name) =>
          attributes.some(
            (attribute) =>
              attribute.AttributeName === name &&
              attribute.AttributeType === 'S',
          ),
        )
      ) {
        throw new Error(
          'Existing local table has incompatible keys. No data was changed.',
        );
      }
      console.info(
        `DynamoDB Local is ready at http://127.0.0.1:8000 with table ${tableName}.`,
      );
      return;
    }
    if (attempt < 29) await setTimeout(1_000);
  }
  throw new Error(
    'DynamoDB Local did not become ready. Run pnpm db:logs for details.',
    { cause: lastError },
  );
}

try {
  await initialize();
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Local database initialization failed.',
  );
  process.exitCode = 1;
} finally {
  client.destroy();
}

import { createSqsClient, LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import { readDatabaseConfig } from '@premiumpass/persistence';

export function readWorkerConfig(env: NodeJS.ProcessEnv, local: boolean) {
  const database = readDatabaseConfig(env, local);
  const queueUrl = env.SUBSCRIPTION_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('SUBSCRIPTION_QUEUE_URL is required.');
  }

  const url = new URL(queueUrl);
  // Keep local queue delivery and persistence together; a half-local setup
  // could otherwise consume cloud work into the demo database.
  if (local) {
    if (
      !database.endpoint ||
      url.origin !== LOCAL_SQS_ENDPOINT ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Local subscription worker requires DynamoDB Local and an ElasticMQ queue at http://127.0.0.1:9324.',
      );
    }
  } else if (url.protocol !== 'https:' || env.SQS_ENDPOINT) {
    throw new Error(
      'Lambda subscription worker requires an AWS HTTPS queue URL and no SQS_ENDPOINT.',
    );
  }

  const sqs = createSqsClient({ local });
  return { database, queueUrl, sqs };
}

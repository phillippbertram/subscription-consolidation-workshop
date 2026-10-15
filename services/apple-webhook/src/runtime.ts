import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSqsClient, LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import {
  createAppleVerifier,
  readAppleSettings,
} from '@premiumpass/apple-store';
import type { Logger } from 'pino';
import { createAppleWebhookApp } from './app.js';

export function createAppleWebhookRuntime(
  env: NodeJS.ProcessEnv,
  local: boolean,
  log: Logger,
) {
  const settings = readAppleSettings(env);
  const queueUrl = env.SUBSCRIPTION_QUEUE_URL;
  if (settings) {
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
        ? url.origin !== LOCAL_SQS_ENDPOINT
        : url.protocol !== 'https:' || Boolean(env.SQS_ENDPOINT))
    ) {
      throw new Error(
        local
          ? 'Apple local ingress requires an ElasticMQ queue at http://127.0.0.1:9324.'
          : 'Apple Lambda ingress requires an AWS HTTPS queue URL and no SQS_ENDPOINT.',
      );
    }
  }

  const sqs = createSqsClient({ local, requestTimeout: 3_000 });
  const app = createAppleWebhookApp(
    settings,
    settings ? createAppleVerifier(settings) : undefined,
    async (job) => {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
    },
    log,
  );
  return { app, appleEnabled: Boolean(settings), close: () => sqs.destroy() };
}

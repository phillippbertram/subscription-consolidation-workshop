import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSqsClient, LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import {
  readGoogleSettings,
  readGooglePushSettings,
  createGooglePushVerifier,
} from '@premiumpass/google-play';
import type { Logger } from 'pino';
import { createGoogleWebhookApp } from './app.js';

export function createGoogleWebhookRuntime(
  env: NodeJS.ProcessEnv,
  local: boolean,
  log: Logger,
) {
  const settings = readGoogleSettings(env);
  const push = settings ? readGooglePushSettings(env) : undefined;
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
          ? 'Google local ingress requires an ElasticMQ queue at http://127.0.0.1:9324.'
          : 'Google Lambda ingress requires an AWS HTTPS queue URL and no SQS_ENDPOINT.',
      );
    }
  }

  const sqs = createSqsClient({ local, requestTimeout: 3000 });
  const app = createGoogleWebhookApp(
    settings,
    push,
    push ? createGooglePushVerifier(push) : undefined,
    async (job) => {
      const receipt = await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
      if (!receipt.MessageId) {
        throw new Error('Queue acceptance unconfirmed.');
      }
    },
    log,
  );
  return { app, googleEnabled: Boolean(settings), close: () => sqs.destroy() };
}

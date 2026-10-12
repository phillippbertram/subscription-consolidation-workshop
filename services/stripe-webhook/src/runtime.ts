import type { Logger } from 'pino';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { readWebhookConfig, readWebhookCredentials } from './config.js';
import { createWebhookApp } from './app.js';

// Reuse AWS connections in warm Lambda invocations. Secrets are refreshed
// separately so a cached client does not freeze credential rotation.
const configurations = new Map<boolean, ReturnType<typeof readWebhookConfig>>();
function configFor(local: boolean) {
  let config = configurations.get(local);
  if (!config) {
    config = readWebhookConfig(process.env, local);
    configurations.set(local, config);
  }
  return config;
}

export async function webhookRuntime(local: boolean, log: Logger) {
  const config = configFor(local);
  const credentials = await readWebhookCredentials(process.env, local);
  return createWebhookApp(
    credentials.webhookSecret,
    async (job) => {
      await config.sqs.send(
        new SendMessageCommand({
          QueueUrl: config.queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
    },
    log,
  );
}

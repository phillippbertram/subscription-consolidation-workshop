import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { z } from 'zod';

const credentialsSchema = z.object({
  webhookSecret: z.string().regex(/^whsec_[A-Za-z0-9]+$/),
});
export type WebhookCredentials = z.infer<typeof credentialsSchema>;

export function readWebhookConfig(env: NodeJS.ProcessEnv, local: boolean) {
  const queueUrl = env.SUBSCRIPTION_QUEUE_URL;
  if (!queueUrl) throw new Error('SUBSCRIPTION_QUEUE_URL is required.');
  const url = new URL(queueUrl);
  // Local webhook forwarding must never enqueue into AWS.
  if (local) {
    if (
      url.origin !== 'http://127.0.0.1:9324' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        'Local webhook requires an ElasticMQ queue at http://127.0.0.1:9324.',
      );
    }
  } else if (url.protocol !== 'https:' || env.SQS_ENDPOINT) {
    throw new Error(
      'Lambda webhook requires an AWS HTTPS queue URL and no SQS_ENDPOINT.',
    );
  }
  const sqs = new SQSClient({
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1_000, requestTimeout: 15_000 },
    ...(local
      ? {
          endpoint: url.origin,
          region: 'us-east-1',
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  return { queueUrl, sqs };
}

let cached: { expiresAt: number; value: WebhookCredentials } | undefined;
export async function readWebhookCredentials(
  env: NodeJS.ProcessEnv,
  local: boolean,
): Promise<WebhookCredentials> {
  if (local) {
    const parsed = credentialsSchema.safeParse({
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    });
    if (!parsed.success)
      throw new Error(
        'Configure STRIPE_WEBHOOK_SECRET in services/stripe-webhook/.env.',
      );
    return parsed.data;
  }
  // Reuse secrets across warm invocations, but bound the cache lifetime so
  // later invocations can pick up rotation without a code deployment.
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!env.STRIPE_SECRET_ARN) throw new Error('STRIPE_SECRET_ARN is required.');
  const client = new SecretsManagerClient({
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1_000, requestTimeout: 3_000 },
  });
  try {
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: env.STRIPE_SECRET_ARN }),
    );
    const parsed = credentialsSchema.safeParse(
      JSON.parse(result.SecretString ?? '{}'),
    );
    if (!parsed.success)
      throw new Error('Invalid Stripe secret configuration.');
    cached = { value: parsed.data, expiresAt: Date.now() + 300_000 };
    return parsed.data;
  } finally {
    client.destroy();
  }
}

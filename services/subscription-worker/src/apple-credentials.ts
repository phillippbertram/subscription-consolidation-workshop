import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '@premiumpass/aws-clients';
import {
  parseAppleCredentials,
  type AppleCredentials,
} from '@premiumpass/apple-store';

// A cache is used here to avoid repeated and expensive calls to AWS Secrets Manager during runtime.
// This reduces unnecessary latency and cost, since each request to Secrets Manager is billed separately.
// The cache stores the most recently fetched credentials along with their expiry time,
// so they can be reused for a short period without refetching from AWS.
let cached:
  { arn: string; expiresAt: number; value: AppleCredentials } | undefined;

export async function readCloudAppleCredentials(
  env: NodeJS.ProcessEnv,
): Promise<AppleCredentials> {
  const arn = env.APPLE_SECRET_ARN;
  if (!arn) {
    throw new Error(
      'APPLE_SECRET_ARN is required when Apple processing is enabled.',
    );
  }

  if (cached?.arn === arn && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = createSecretsManagerClient();
  try {
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: arn }),
    );
    const value = parseAppleCredentials(
      JSON.parse(result.SecretString ?? '{}'),
    );
    // The cache duration is 5 minutes (300,000 milliseconds).
    cached = { arn, expiresAt: Date.now() + 300_000, value };
    return value;
  } finally {
    client.destroy();
  }
}

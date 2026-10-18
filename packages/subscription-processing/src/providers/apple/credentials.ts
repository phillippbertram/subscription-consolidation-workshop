import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '@premiumpass/aws-clients';
import {
  parseAppleCredentials,
  type AppleCredentials,
} from '@premiumpass/apple-store';

// Reuse credentials briefly in warm workers while still allowing key rotation.
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
    cached = { arn, expiresAt: Date.now() + 300_000, value };
    return value;
  } finally {
    client.destroy();
  }
}

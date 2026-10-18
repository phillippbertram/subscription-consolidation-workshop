import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '@premiumpass/aws-clients';
import {
  GooglePlayError,
  parseGoogleCredentials,
  type GoogleCredentials,
} from '@premiumpass/google-play';

// A dedicated key secret fits this demo's existing AWS setup. Workload Identity
// Federation would avoid a long-lived Google key but needs separate cross-cloud trust.
let cached:
  { arn: string; expiresAt: number; value: GoogleCredentials } | undefined;

/** Bound the cache so warm workers eventually pick up a rotated service-account key. */
export async function readCloudGoogleCredentials(
  env: NodeJS.ProcessEnv,
): Promise<GoogleCredentials> {
  const arn = env.GOOGLE_PLAY_SECRET_ARN;
  if (!arn) {
    throw new GooglePlayError('google_secret_not_configured');
  }

  if (cached?.arn === arn && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = createSecretsManagerClient();
  try {
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: arn }),
    );
    const value = parseGoogleCredentials(
      JSON.parse(result.SecretString ?? '{}') as unknown,
    );
    cached = { arn, expiresAt: Date.now() + 300_000, value };
    return value;
  } catch (error) {
    // SDK/JSON errors may contain secret contents or headers; expose safe codes only.
    if (error instanceof GooglePlayError) {
      throw error;
    }

    throw new GooglePlayError('google_credentials_unavailable');
  } finally {
    client.destroy();
  }
}

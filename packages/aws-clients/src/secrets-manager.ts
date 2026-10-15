import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export function createSecretsManagerClient() {
  return new SecretsManagerClient({
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1_000, requestTimeout: 3_000 },
  });
}

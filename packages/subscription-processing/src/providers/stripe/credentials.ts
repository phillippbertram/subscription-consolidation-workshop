import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createSecretsManagerClient } from '@premiumpass/aws-clients';
import { z } from 'zod';

const credentialsSchema = z.object({
  secretKey: z.string().regex(/^sk_test_[A-Za-z0-9]+$/),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
});
export type StripeCredentials = z.infer<typeof credentialsSchema>;

let cached: { expiresAt: number; value: StripeCredentials } | undefined;
export async function readStripeCredentials(
  env: NodeJS.ProcessEnv,
  local: boolean,
): Promise<StripeCredentials> {
  if (local) {
    const parsed = credentialsSchema.safeParse({
      secretKey: env.STRIPE_SECRET_KEY,
      priceId: env.STRIPE_PRICE_ID,
    });
    if (!parsed.success) {
      throw new Error(
        'Configure STRIPE_SECRET_KEY (test mode) and STRIPE_PRICE_ID in the calling app or worker environment.',
      );
    }

    return parsed.data;
  }

  // Reuse secrets across warm invocations, but bound the cache lifetime so
  // later invocations can pick up rotation without a code deployment.
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (!env.STRIPE_SECRET_ARN) {
    throw new Error('STRIPE_SECRET_ARN is required.');
  }

  const client = createSecretsManagerClient();
  try {
    const result = await client.send(
      new GetSecretValueCommand({ SecretId: env.STRIPE_SECRET_ARN }),
    );
    const parsed = credentialsSchema.safeParse(
      JSON.parse(result.SecretString ?? '{}'),
    );
    if (!parsed.success) {
      throw new Error('Invalid Stripe secret configuration.');
    }

    cached = { value: parsed.data, expiresAt: Date.now() + 300_000 };
    return parsed.data;
  } finally {
    client.destroy();
  }
}

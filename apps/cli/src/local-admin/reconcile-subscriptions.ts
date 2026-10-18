import { readCliEnvironment } from '../config.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ProcessingError } from '@premiumpass/subscription-processing';
import type { LocalSubscriptionStore } from './store.js';

export async function reconcileLocalSubscriptions(
  local: LocalSubscriptionStore,
  userId: string,
  options: { dryRun?: boolean; onProgress?: (message: string) => void },
) {
  const { store, stripeStore, documentClient, tableName, loadUser } = local;
  await loadUser(userId);
  const mapping = await documentClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: `USER#${userId}`, sk: 'CUSTOMER#stripe' },
      ConsistentRead: true,
    }),
  );
  const customerId = mapping.Item?.customerId as unknown;
  if (
    mapping.Item?.userId !== userId ||
    typeof customerId !== 'string' ||
    !/^cus_[A-Za-z0-9]+$/.test(customerId)
  ) {
    throw new Error('No valid local Stripe customer mapping for this user.');
  }

  // Load provider configuration only for reconciliation; ordinary local edits
  // need no Stripe credentials. Reuse the same verified processing path as SQS.
  const { readStripeCredentials } =
    await import('@premiumpass/subscription-processing/stripe/credentials');
  const credentials = await readStripeCredentials(readCliEnvironment(), true);
  const { default: Stripe } = await import('stripe');
  const { reconcileStripeSubscriptions } =
    await import('@premiumpass/subscription-processing/reconciliation/stripe');
  try {
    const rows = await reconcileStripeSubscriptions({
      stripe: new Stripe(credentials.secretKey, {
        maxNetworkRetries: 1,
        timeout: 5_000,
      }),
      priceId: credentials.priceId,
      store: stripeStore,
      userId,
      customerId,
      dryRun: Boolean(options.dryRun),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
    return { rows, subscriptions: (await store.load(userId)).subscriptions };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(
        'Stripe could not be read. Check the CLI test key and connection, then retry.',
        { cause: error },
      );
    }

    if (error instanceof ProcessingError) {
      throw new Error(`Reconciliation failed: ${error.code}.`, {
        cause: error,
      });
    }

    throw error;
  }
}

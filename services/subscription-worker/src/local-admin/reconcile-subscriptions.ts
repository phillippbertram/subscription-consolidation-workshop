import { loadEnvFile } from 'node:process';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ProcessingError } from '../processing/contracts.js';
import type { LocalSubscriptionStore } from './store.js';

export async function reconcileLocalSubscriptions(
  local: LocalSubscriptionStore,
  userId: string,
  options: { dryRun?: boolean; onProgress?: (message: string) => void },
) {
  const { store, documentClient, tableName, loadUser } = local;
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

  // Only reconciliation needs provider credentials. Existing shell values win.
  try {
    loadEnvFile(new URL('../../.env', import.meta.url));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Unable to load services/subscription-worker/.env.', {
        cause: error,
      });
    }
  }

  // These imports use dynamic 'await import' so that local reconciliation does not require all dependencies
  // unless the function is actually called (on-demand). This limits memory, load time, and allows the CLI
  // to function even if optional dependencies like Stripe are not installed unless needed.
  const { readWorkerCredentials } = await import('../config.js');
  const credentials = await readWorkerCredentials(process.env, true);
  const { default: Stripe } = await import('stripe');
  const { reconcileStripeSubscriptions } =
    await import('../reconciliation/stripe.js');
  try {
    const rows = await reconcileStripeSubscriptions({
      stripe: new Stripe(credentials.secretKey, {
        maxNetworkRetries: 1,
        timeout: 5_000,
      }),
      priceId: credentials.priceId,
      store,
      userId,
      customerId,
      dryRun: Boolean(options.dryRun),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    });
    return { rows, subscriptions: (await store.load(userId)).subscriptions };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new Error(
        'Stripe could not be read. Check the worker test key and connection, then retry.',
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

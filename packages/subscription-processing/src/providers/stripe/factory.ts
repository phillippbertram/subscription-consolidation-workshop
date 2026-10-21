import Stripe from 'stripe';
import { readStripeCredentials } from './credentials.js';
import type { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { StripeSubscriptionProcessor } from './processor.js';
import { StripeSubscriptionSource } from './source.js';
import { DynamoDbStripeStore } from './store.js';

/** Read current/cached credentials only when a Stripe job selects this factory. */
export async function createStripeProcessor(
  store: DynamoDbProcessingStore,
  env: NodeJS.ProcessEnv,
  local: boolean,
) {
  const credentials = await readStripeCredentials(env, local);
  const stripe = new Stripe(credentials.secretKey, {
    maxNetworkRetries: 0,
    timeout: 3_000,
  });
  return new StripeSubscriptionProcessor(
    new DynamoDbStripeStore(store),
    new StripeSubscriptionSource(stripe, credentials.productId),
  );
}

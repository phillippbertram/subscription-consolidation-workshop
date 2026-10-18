import Stripe from 'stripe';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbProcessingStore } from '../../processing/dynamodb-processing.js';
import { discoverStripeSubscriptions } from '../../reconciliation/stripe.js';
import { readStripeCredentials } from './credentials.js';
import { DynamoDbStripeStore } from './store.js';
import {
  StripeReconciliationStore,
  type StripeCustomerReference,
} from './reconciliation-store.js';

export {
  StripeReconciliationStore,
  type StripeCustomerReference,
} from './reconciliation-store.js';

/** Compose read-only persistence and provider discovery; the caller owns delivery. */
export function createStripeReconciliation(options: {
  client: DynamoDBDocumentClient;
  tableName: string;
  env: NodeJS.ProcessEnv;
}) {
  const store = new DynamoDbStripeStore(
    new DynamoDbProcessingStore(options.client, options.tableName),
  );
  return {
    store: new StripeReconciliationStore(options.client, options.tableName),
    async subscriptions(
      reference: StripeCustomerReference,
      checkTime: () => void,
    ) {
      checkTime();
      // No key is needed for an empty table. Refresh through the bounded secret
      // cache for each customer, and finish every page before releasing any jobs.
      const credentials = await readStripeCredentials(options.env, false);
      const { ids } = await discoverStripeSubscriptions({
        stripe: new Stripe(credentials.secretKey, {
          timeout: 3_000,
          maxNetworkRetries: 0,
        }),
        store,
        ...reference,
        checkTime,
      });
      return [...ids];
    },
  };
}

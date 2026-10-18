import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { createApiFunction, createHttpApi } from './resources/api.js';
import { createOutputs } from './resources/outputs.js';
import { createParameters } from './resources/parameters.js';
import { createReconciliation } from './resources/reconciliation.js';
import { createStorage } from './resources/storage.js';
import { createWebhooks } from './resources/webhooks.js';
import { createWorker } from './resources/worker.js';

/**
 * The PremiumPass development stack, assembled from small building blocks:
 *
 * 1. Parameters: Auth0, Stripe secret, and opt-in switches for Apple/Google.
 * 2. Storage: one DynamoDB table plus the work queue and its DLQ.
 * 3. Webhooks: verify each provider's caller and enqueue references.
 * 4. Worker: reads provider state and writes subscriptions atomically.
 * 5. API: verifies Auth0 tokens and serves profile and access.
 * 6. Reconciliation: scheduled discovery of missed updates.
 * 7. HTTP API and outputs: one public endpoint and the values to register.
 *
 * Each block lives in `resources/` and adds only the IAM permissions it needs.
 * Resources are created directly in this stack, so their logical IDs stay stable.
 */
export class PremiumPassStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const { auth0, stripeSecret, apple, google, reconciliation } =
      createParameters(this);

    const { table, queue, dlq } = createStorage(this);
    const webhooks = createWebhooks(this, {
      queue,
      stripeSecret,
      apple,
      google,
    });
    createWorker(this, { table, queue, stripeSecret, apple, google });
    const apiFunction = createApiFunction(this, {
      table,
      queue,
      auth0,
      google,
    });
    const discovery = createReconciliation(this, {
      table,
      queue,
      stripeSecretArn: stripeSecret.secretArn,
      apple,
      google,
      settings: reconciliation,
    });

    const api = createHttpApi(this, { apiFunction, webhooks });
    createOutputs(this, {
      api,
      apiFunction,
      table,
      queue,
      dlq,
      reconciliation: discovery,
    });
  }
}

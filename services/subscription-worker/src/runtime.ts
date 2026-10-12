import Stripe from 'stripe';
import type { Logger } from 'pino';
import { createDocumentClient } from '@premiumpass/persistence';
import { DynamoDbProcessingStore } from './processing/dynamodb-processing.js';
import { jobSchema } from '@premiumpass/billing-contracts';
import { ProcessingError } from './processing/contracts.js';
import { SubscriptionProcessor } from './processing/processor.js';
import { StripeSubscriptionSource } from './processing/stripe-source.js';
import { readWorkerConfig, readWorkerCredentials } from './config.js';

// Reuse AWS connections in warm Lambda invocations. Secrets are refreshed
// separately so a cached client does not freeze credential rotation.
const configurations = new Map<boolean, ReturnType<typeof readWorkerConfig>>();
const stores = new Map<boolean, DynamoDbProcessingStore>();
function configFor(local: boolean) {
  let config = configurations.get(local);
  if (!config) {
    config = readWorkerConfig(process.env, local);
    configurations.set(local, config);
  }
  return config;
}

export async function workerRuntime(local: boolean) {
  const config = configFor(local);
  const credentials = await readWorkerCredentials(process.env, local);
  const stripe = new Stripe(credentials.secretKey, {
    maxNetworkRetries: 0,
    timeout: 3_000,
  });
  let store = stores.get(local);
  if (!store) {
    store = new DynamoDbProcessingStore(
      createDocumentClient(config.database),
      config.database.tableName,
    );
    stores.set(local, store);
  }
  return {
    ...config,
    processor: new SubscriptionProcessor(
      store,
      new StripeSubscriptionSource(stripe, credentials.priceId),
    ),
  };
}

export async function processMessage(
  processor: SubscriptionProcessor,
  body: string,
  log: Logger,
) {
  // Avoid Zod error output: it can contain arbitrary queue payload content.
  const parsed = jobSchema.safeParse(JSON.parse(body) as unknown);
  if (!parsed.success) throw new ProcessingError('invalid_queue_job');
  const job = parsed.data;
  const fields = {
    correlationId: job.correlationId,
    provider: job.provider,
    providerEventId: job.eventId,
  };
  try {
    const result = await processor.process(job);
    log.info({ event: 'subscription.processed', ...fields, ...result });
  } catch (error) {
    log.error({
      event: 'subscription.failed',
      ...fields,
      code:
        error instanceof ProcessingError
          ? error.code
          : 'provider_or_storage_unavailable',
    });
    throw new ProcessingError('message_processing_failed');
  }
}

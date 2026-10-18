import type { Logger } from '@premiumpass/logging';
import { createDocumentClient } from '@premiumpass/aws-clients';
import {
  subscriptionJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import { GooglePlayError } from '@premiumpass/google-play/contracts';
import { readWorkerConfig } from './config.js';
import {
  ProcessingError,
  DynamoDbProcessingStore,
  createExpirationProcessor,
} from '@premiumpass/subscription-processing';
import { createStripeProcessor } from '@premiumpass/subscription-processing/stripe';
import { createAppleProcessor } from '@premiumpass/subscription-processing/apple';
import { createGoogleProcessorFactory } from '@premiumpass/subscription-processing/google';
import { createGoogleMockProcessor } from '@premiumpass/subscription-processing/google-mock';

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

export function workerRuntime(local: boolean) {
  const config = configFor(local);
  let store = stores.get(local);
  if (!store) {
    store = new DynamoDbProcessingStore(
      createDocumentClient(config.database),
      config.database.tableName,
    );
    stores.set(local, store);
  }

  const createGoogleProcessor = createGoogleProcessorFactory(
    store,
    process.env,
    local,
  );
  return {
    ...config,
    processor: {
      async process(job: SubscriptionJob) {
        // Select the provider before reading credentials, so one unavailable
        // provider cannot block unrelated jobs or local exercises.
        switch (job.provider) {
          case 'stripe': {
            const processor = await createStripeProcessor(
              store,
              process.env,
              local,
            );
            return processor.process(job);
          }

          case 'apple': {
            const processor = await createAppleProcessor(
              store,
              process.env,
              local,
            );
            return processor.process(job);
          }

          case 'google': {
            const processor = await createGoogleProcessor();
            return processor.process(job);
          }

          case 'google_mock': {
            return createGoogleMockProcessor(store, local).process(job);
          }

          case 'local_expiration': {
            return createExpirationProcessor(store, local).process(job);
          }
        }
      },
    },
  };
}

export async function processMessage(
  processor: { process(job: SubscriptionJob): Promise<{ outcome: string }> },
  body: string,
  log: Logger,
) {
  // Avoid Zod error output: it can contain arbitrary queue payload content.
  const parsed = subscriptionJobSchema.safeParse(JSON.parse(body) as unknown);
  if (!parsed.success) {
    throw new ProcessingError('invalid_queue_job');
  }

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
        error instanceof ProcessingError || error instanceof GooglePlayError
          ? error.code
          : 'provider_or_storage_unavailable',
    });
    throw new ProcessingError('message_processing_failed');
  }
}

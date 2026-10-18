import { readCloudAppleCredentials } from './apple-credentials.js';
import Stripe from 'stripe';
import type { Logger } from 'pino';
import { createDocumentClient } from '@premiumpass/aws-clients';
import { DynamoDbProcessingStore } from './processing/dynamodb-processing.js';
import {
  subscriptionJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import {
  readAppleSettings,
  readLocalAppleCredentials,
} from '@premiumpass/apple-store';
import { AppleSubscriptionProcessor } from './processing/apple-processor.js';
import { createAppleSource } from './processing/apple-source.js';
import { ProcessingError } from './processing/contracts.js';
import { SubscriptionProcessor } from './processing/processor.js';
import { StripeSubscriptionSource } from './processing/stripe-source.js';
import { readWorkerConfig, readWorkerCredentials } from './config.js';
import { GoogleMockProcessor } from './processing/google-mock-processor.js';
import { ExpirationProcessor } from './processing/expiration.js';

// Reuse AWS connections in warm Lambda invocations. Secrets are refreshed
// separately so a cached client does not freeze credential rotation.
const configurations = new Map<boolean, ReturnType<typeof readWorkerConfig>>();
const stores = new Map<
  boolean,
  {
    store: DynamoDbProcessingStore;
    documentClient: ReturnType<typeof createDocumentClient>;
  }
>();

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
  let persistence = stores.get(local);
  if (!persistence) {
    const documentClient = createDocumentClient(config.database);
    persistence = {
      documentClient,
      store: new DynamoDbProcessingStore(
        documentClient,
        config.database.tableName,
      ),
    };
    stores.set(local, persistence);
  }

  const { store, documentClient } = persistence;
  return {
    ...config,
    processor: {
      async process(job: SubscriptionJob) {
        // Local exercises must never become a cloud authentication/provider fallback.
        if (
          job.provider === 'google_mock' ||
          job.provider === 'local_expiration'
        ) {
          if (!local) {
            throw new ProcessingError('local_job_rejected');
          }

          return job.provider === 'google_mock'
            ? new GoogleMockProcessor(
                store,
                documentClient,
                config.database.tableName,
              ).process(job)
            : new ExpirationProcessor(
                store,
                documentClient,
                config.database.tableName,
              ).process(job);
        }

        // Load only the selected provider's credentials. A blocked Apple account
        // cannot prevent Stripe, expiration, or explicit local mocks from running.
        if (job.provider === 'stripe') {
          const credentials = await readWorkerCredentials(process.env, local);
          const stripe = new Stripe(credentials.secretKey, {
            maxNetworkRetries: 0,
            timeout: 3_000,
          });
          return new SubscriptionProcessor(
            store,
            new StripeSubscriptionSource(stripe, credentials.priceId),
          ).process(job);
        }

        if (!local && job.eventType === 'reconciliation') {
          throw new ProcessingError('local_job_rejected');
        }

        const settings = readAppleSettings(process.env);
        if (!settings) {
          throw new ProcessingError('apple_not_configured');
        }

        const credentials = local
          ? readLocalAppleCredentials(process.env)
          : await readCloudAppleCredentials(process.env);
        return new AppleSubscriptionProcessor(
          store,
          createAppleSource(settings, credentials),
        ).process(job);
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
        error instanceof ProcessingError
          ? error.code
          : 'provider_or_storage_unavailable',
    });
    throw new ProcessingError('message_processing_failed');
  }
}

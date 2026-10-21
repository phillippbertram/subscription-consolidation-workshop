import { pickFields, type Logger } from '@premiumpass/logging';
import { createDocumentClient } from '@premiumpass/aws-clients';
import {
  subscriptionJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import {
  GooglePlayError,
  googleSubscriptionId,
} from '@premiumpass/google-play/contracts';
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

/** Transport details that explain retries; they are not part of the job. */
export interface QueueMessageInfo {
  messageId?: string | undefined;
  // The queue counts every delivery. Above 1 means an earlier attempt failed.
  receiveCount?: number | undefined;
}

/**
 * Process one queue message and log its path: received, then processed or
 * failed. Follow `correlationId` from the webhook's "received" entry to here.
 */
export async function processMessage(
  processor: {
    process(
      job: SubscriptionJob,
    ): Promise<{ outcome: string; subscription?: unknown }>;
  },
  body: string,
  log: Logger,
  queue: QueueMessageInfo = {},
) {
  const startedAt = Date.now();
  let payload: unknown;
  let isJson = true;
  try {
    payload = JSON.parse(body);
  } catch {
    // Not JSON at all: the schema check below fails too, and the log says why.
    payload = undefined;
    isJson = false;
  }

  // Avoid logging Zod messages: they can contain arbitrary queue payload content.
  const parsed = subscriptionJobSchema.safeParse(payload);
  if (!parsed.success) {
    // Paths and rule codes show which field is wrong; the values stay out. The
    // job is a union, so Zod can only say "no variant matched". Naming the
    // provider and event type the sender claimed shows which variant to check.
    log.error({
      event: 'subscription.invalid_job',
      ...queue,
      reason: isJson ? 'schema_mismatch' : 'not_json',
      bodyBytes: Buffer.byteLength(body),
      claimed: pickFields(payload, ['provider', 'eventType']),
      issues: parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'job'}: ${issue.code}`),
    });
    throw new ProcessingError('invalid_queue_job');
  }

  const job = parsed.data;
  const fields = {
    correlationId: job.correlationId,
    provider: job.provider,
    providerEventId: job.eventId,
    ...queue,
  };
  log.info({
    event: 'subscription.received',
    ...fields,
    // How long the job waited between the webhook and the worker.
    queueLagMs: Date.now() - Date.parse(job.receivedAt),
    job: summarizeJob(job),
  });
  try {
    const { subscription, ...result } = await processor.process(job);
    log.info({
      event: 'subscription.processed',
      ...fields,
      ...result,
      durationMs: Date.now() - startedAt,
      subscription:
        subscription === undefined
          ? undefined
          : summarizeSubscription(subscription),
    });
  } catch (error) {
    log.error({
      event: 'subscription.failed',
      ...fields,
      durationMs: Date.now() - startedAt,
      code:
        error instanceof ProcessingError || error instanceof GooglePlayError
          ? error.code
          : 'provider_or_storage_unavailable',
    });
    throw new ProcessingError('message_processing_failed');
  }
}

/**
 * The job is a reference, not the provider's payload: IDs that say what to
 * refresh. A Google job also carries a bearer purchase token, which is replaced
 * by the digest that names the subscription in the database.
 */
function summarizeJob(job: SubscriptionJob) {
  const summary = pickFields(job, [
    'provider',
    'environment',
    'eventType',
    'eventId',
    'objectId',
    'transactionId',
    'packageName',
    'userId',
    'expectedUserId',
    'subscriptionId',
    'receivedAt',
  ]);
  if (job.provider !== 'google') {
    return summary;
  }

  // Logging must never change how a job is processed, so a digest failure
  // only omits this field.
  try {
    return {
      ...summary,
      providerSubscriptionId: googleSubscriptionId(
        { packageName: job.packageName },
        job.purchaseToken,
      ),
    };
  } catch {
    return summary;
  }
}

/** What the worker concluded from the provider's answer, in our shared terms. */
function summarizeSubscription(subscription: unknown) {
  return pickFields(subscription, [
    'provider',
    'providerSubscriptionId',
    'productId',
    'state',
    'providerStatus',
    'cancelAtPeriodEnd',
    'accessUntil',
    'graceUntil',
    'verifiedAt',
    'revision',
  ]);
}

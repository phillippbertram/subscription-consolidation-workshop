import { randomUUID } from 'node:crypto';
import type { Context } from 'aws-lambda';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  createDocumentClient,
  createSqsClient,
} from '@premiumpass/aws-clients';
import { readDatabaseConfig } from '@premiumpass/persistence';
import { readGoogleSettings } from '@premiumpass/google-play/contracts';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { ProcessingError } from '@premiumpass/subscription-processing/contracts';
import { createStripeReconciliation } from '@premiumpass/subscription-processing/stripe/discovery';
import { AppleReconciliationStore } from '@premiumpass/subscription-processing/apple/discovery';
import { GoogleReconciliationStore } from '@premiumpass/subscription-processing/google/discovery';
import { z } from 'zod';
import { runStripeReconciliation } from './stripe-run.js';
import { runAppleReconciliation } from './apple-run.js';
import { runGoogleReconciliation } from './google-run.js';
import type { ReconciliationRun } from './run.js';

const eventSchema = z.object({
  id: z.uuid().optional(),
  time: z.iso.datetime({ offset: true }).optional(),
  dryRun: z.boolean().default(false),
});
const log = createLogger(
  readLogLevel(process.env),
  'premiumpass-reconciliation',
);

/** One isolated Lambda per provider, invoked by the shared rule or an IAM operator. */
export async function handler(event: unknown, context: Context) {
  const provider = z
    .enum(['stripe', 'apple', 'google'])
    .parse(process.env.RECONCILIATION_PROVIDER);
  const enabled = z
    .enum(['true', 'false'])
    .default('false')
    .parse(process.env.RECONCILIATION_ENABLED);
  if (enabled === 'false') {
    return { provider, disabled: true };
  }

  const input = eventSchema.safeParse(event);
  if (!input.success) {
    throw new ProcessingError('invalid_reconciliation_event');
  }

  const database = readDatabaseConfig(process.env);
  const queueUrl = process.env.SUBSCRIPTION_QUEUE_URL;
  if (!queueUrl) {
    throw new ProcessingError('reconciliation_queue_missing');
  }

  const url = new URL(queueUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    process.env.SQS_ENDPOINT
  ) {
    throw new ProcessingError('reconciliation_queue_invalid');
  }

  const runId = input.data.id ?? randomUUID();
  const client = createDocumentClient();
  const sqs = createSqsClient({ local: false, requestTimeout: 3000 });
  const run: ReconciliationRun = {
    runId,
    // Manual events may include an offset; queue contracts use canonical UTC.
    receivedAt: new Date(input.data.time ?? Date.now()).toISOString(),
    dryRun: input.data.dryRun,
    log,
    checkTime() {
      // Stop before the hard timeout. This demo retries the scan without a durable cursor.
      if (context.getRemainingTimeInMillis() < 10_000) {
        throw new ProcessingError('reconciliation_time_budget_exhausted');
      }
    },
    async enqueue(job) {
      const receipt = await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(job),
        }),
      );
      if (!receipt.MessageId) {
        throw new ProcessingError('queue_acceptance_unconfirmed');
      }
    },
  };
  try {
    switch (provider) {
      case 'stripe': {
        return await runStripeReconciliation({
          ...run,
          ...createStripeReconciliation({
            client,
            tableName: database.tableName,
            env: process.env,
          }),
        });
      }

      case 'apple': {
        if (process.env.APPLE_ENABLED !== 'true') {
          throw new ProcessingError('apple_disabled');
        }

        return await runAppleReconciliation({
          ...run,
          store: new AppleReconciliationStore(client, database.tableName),
        });
      }

      case 'google': {
        const settings = readGoogleSettings(process.env);
        if (!settings) {
          throw new ProcessingError('google_disabled');
        }

        return await runGoogleReconciliation({
          ...run,
          packageName: settings.packageName,
          store: new GoogleReconciliationStore(
            client,
            database.tableName,
            settings.packageName,
          ),
        });
      }
    }
  } catch (error) {
    // SDK/schema errors can contain purchase tokens or complete provider payloads.
    log.error({
      event: 'reconciliation.run_failed',
      provider,
      runId,
      code:
        error instanceof ProcessingError
          ? error.code
          : 'provider_storage_or_queue_unavailable',
    });
    throw new ProcessingError('reconciliation_run_failed');
  } finally {
    client.destroy();
    sqs.destroy();
  }
}

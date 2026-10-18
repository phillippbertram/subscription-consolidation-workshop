import { loadEnvFile } from 'node:process';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSqsClient, LOCAL_SQS_ENDPOINT } from '@premiumpass/aws-clients';
import {
  subscriptionJobSchema,
  type SubscriptionJob,
} from '@premiumpass/billing-contracts';
import Stripe from 'stripe';
import {
  readAppleSettings,
  readLocalAppleCredentials,
} from '@premiumpass/apple-store';
import { readWorkerCredentials } from '../config.js';
import { createAppleSource } from '../processing/apple-source.js';
import { ProcessingError } from '../processing/contracts.js';

export function localReconciliationQueue() {
  const client = createSqsClient({ local: true });
  return {
    async enqueue(job: SubscriptionJob) {
      const response = await client.send(
        new SendMessageCommand({
          QueueUrl: `${LOCAL_SQS_ENDPOINT}/000000000000/premiumpass-subscriptions`,
          MessageBody: JSON.stringify(subscriptionJobSchema.parse(job)),
        }),
      );
      if (!response.MessageId) {
        throw new Error('queue_acceptance_unconfirmed');
      }
    },
    close: () => client.destroy(),
  };
}

function loadWorkerEnvironment() {
  try {
    // Resolve from cwd so the same command works from source and bundled output.
    loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error('Unable to load the subscription worker environment.', {
        cause: error,
      });
    }
  }
}

export async function localStripeReader() {
  loadWorkerEnvironment();
  const credentials = await readWorkerCredentials(process.env, true);
  return {
    stripe: new Stripe(credentials.secretKey, {
      maxNetworkRetries: 1,
      timeout: 5_000,
    }),
    priceId: credentials.priceId,
  };
}

export function localAppleReader() {
  loadWorkerEnvironment();
  const settings = readAppleSettings(process.env);
  if (!settings) {
    throw new ProcessingError('apple_not_configured');
  }

  return createAppleSource(settings, readLocalAppleCredentials(process.env));
}

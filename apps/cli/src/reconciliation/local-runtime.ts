import { readCliEnvironment } from '../config.js';
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
import { readStripeCredentials } from '@premiumpass/subscription-processing/stripe/credentials';
import { createAppleSource } from '@premiumpass/subscription-processing/apple/source';
import { ProcessingError } from '@premiumpass/subscription-processing';
import {
  createGoogleClient,
  readGoogleSettings,
} from '@premiumpass/google-play';
import { GoogleSubscriptionSource } from '@premiumpass/subscription-processing/google/source';

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

export async function localStripeReader() {
  const env = readCliEnvironment();
  const credentials = await readStripeCredentials(env, true);
  return {
    stripe: new Stripe(credentials.secretKey, {
      maxNetworkRetries: 1,
      timeout: 5_000,
    }),
    priceId: credentials.priceId,
  };
}

export function localAppleReader() {
  const env = readCliEnvironment();
  const settings = readAppleSettings(env);
  if (!settings) {
    throw new ProcessingError('apple_not_configured');
  }

  return createAppleSource(settings, readLocalAppleCredentials(env));
}

export function localGoogleReader() {
  const env = readCliEnvironment();
  const settings = readGoogleSettings(env);
  if (!settings) {
    throw new ProcessingError('google_not_configured');
  }

  return new GoogleSubscriptionSource(
    settings,
    createGoogleClient(settings, env),
  );
}

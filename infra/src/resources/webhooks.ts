import { Duration } from 'aws-cdk-lib';
import type { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Queue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { createServiceFunction } from './lambda.js';
import type { AppleParameters, GoogleParameters } from './parameters.js';

/**
 * One Lambda per provider. Each verifies its own caller (signature or
 * Pub/Sub identity) and only enqueues references. None gets database access.
 */
export function createWebhooks(
  scope: Construct,
  {
    queue,
    stripeSecret,
    apple,
    google,
  }: {
    queue: Queue;
    stripeSecret: ISecret;
    apple: AppleParameters;
    google: GoogleParameters;
  },
) {
  const stripe = createServiceFunction(
    scope,
    'StripeWebhook',
    'stripe-webhook',
    {
      description:
        'Verifies Stripe webhook signatures and enqueues supported billing events in SQS.',
      timeout: Duration.seconds(20),
      environment: {
        SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
        STRIPE_SECRET_ARN: stripeSecret.secretArn,
      },
    },
  );
  // The Stripe webhook needs its signing secret from the shared Stripe secret.
  stripeSecret.grantRead(stripe);
  queue.grantSendMessages(stripe);

  // Apple ingress verifies with public certificates: it needs queue-send
  // permission, but no private key, Stripe secret, or database access.
  const appleWebhook = createServiceFunction(
    scope,
    'AppleWebhook',
    'apple-webhook',
    {
      description:
        'Verifies Apple Sandbox notifications and enqueues subscription references in SQS.',
      timeout: Duration.seconds(20),
      environment: {
        SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
        ...appleEnvironment(apple),
      },
    },
  );
  queue.grantSendMessages(appleWebhook);

  // Authenticated Pub/Sub push uses Google's public signing keys. Ingress
  // only enqueues references; the worker alone may read the service-account key.
  const googleWebhook = createServiceFunction(
    scope,
    'GoogleWebhook',
    'google-webhook',
    {
      description:
        'Authenticates Google Pub/Sub push identity and enqueues Google Play subscription references in SQS.',
      timeout: Duration.seconds(20),
      environment: {
        SUBSCRIPTION_QUEUE_URL: queue.queueUrl,
        ...googleEnvironment(google),
        GOOGLE_PLAY_PUSH_AUDIENCE: google.pushAudience,
        GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL: google.pushEmail,
        GOOGLE_PLAY_PUSH_SUBSCRIPTION: google.pushSubscription,
      },
    },
  );
  queue.grantSendMessages(googleWebhook);

  return { stripe, apple: appleWebhook, google: googleWebhook };
}

/** Public Apple settings shared by webhook and worker. */
export function appleEnvironment(apple: AppleParameters) {
  return {
    APPLE_ENABLED: apple.enabled,
    APPLE_BUNDLE_ID: apple.bundleId,
    APPLE_PRODUCT_ID: apple.productId,
  };
}

/** Public Google settings shared by API, webhook, worker, and discovery. */
export function googleEnvironment(google: GoogleParameters) {
  return {
    GOOGLE_PLAY_ENABLED: google.enabled,
    GOOGLE_PLAY_PACKAGE_NAME: google.packageName,
    GOOGLE_PLAY_PRODUCT_ID: google.productId,
    GOOGLE_PLAY_BASE_PLAN_ID: google.basePlanId,
  };
}

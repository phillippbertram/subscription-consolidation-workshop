/**
 * Who receives which setting.
 *
 * `pnpm config:sync` reads config/.env and writes one .env file per target
 * below. A target lists the variables its program reads and where each value
 * comes from. A program receives nothing else, so a secret reaches only the
 * programs listed for it: only the worker and the CLI get store private keys,
 * only the Stripe webhook gets the webhook secret, and no ingress gets a key.
 *
 * Each value is either the name of a setting in config/.env or a derived value,
 * used when a program expects another format of the same fact. Programs keep
 * reading their own .env exactly as before; only the source of the values
 * moved to one place.
 */

/** A target value computed from one setting in config/.env. */
function derived(source, forward, reverse) {
  return { source, forward, reverse };
}

/** Map variables that keep their name, for example LOG_LEVEL → LOG_LEVEL. */
function same(...names) {
  return Object.fromEntries(names.map((name) => [name, name]));
}

// Auth0 puts https://<domain>/ into every token; the API and AWS compare it
// exactly. Deriving it from the bare domain keeps Web, Mobile, and API on one
// tenant. `reverse` lets `pnpm config:import` read an old issuer back.
const auth0Issuer = derived(
  'AUTH0_DOMAIN',
  (domain) => `https://${domain}/`,
  (issuer) => issuer.replace(/^https:\/\//, '').replace(/\/$/, ''),
);

const appleShared = same(
  'APPLE_ENABLED',
  'APPLE_BUNDLE_ID',
  'APPLE_PRODUCT_ID',
);
const appleKey = same(
  'APPLE_IAP_KEY_ID',
  'APPLE_IAP_ISSUER_ID',
  'APPLE_IAP_PRIVATE_KEY_PATH',
);
const googleShared = same(
  'GOOGLE_PLAY_ENABLED',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_PRODUCT_ID',
  'GOOGLE_PLAY_BASE_PLAN_ID',
);

export const targets = [
  {
    file: 'services/api/.env',
    purpose:
      'Local API: verifies Auth0 tokens, starts checkouts, queues purchase syncs. No store private keys.',
    settings: {
      PORT: 'API_PORT',
      HOST: 'API_HOST',
      LOG_LEVEL: 'API_LOG_LEVEL',
      AUTH0_ISSUER: auth0Issuer,
      ...same(
        'AUTH0_AUDIENCE',
        'DYNAMODB_TABLE_NAME',
        'DYNAMODB_ENDPOINT',
        'WEB_ORIGIN',
        'STRIPE_SECRET_KEY',
        'STRIPE_PRODUCT_ID',
        'STRIPE_MONTHLY_PRICE_LOOKUP_KEY',
        'STRIPE_DAILY_PRICE_LOOKUP_KEY',
        'APPLE_ENABLED',
        'APPLE_PRODUCT_ID',
        'SUBSCRIPTION_QUEUE_URL',
        // Enables the local-only /admin routes; the Lambda entry ignores it.
        'ADMIN_SECRET',
      ),
      ...googleShared,
    },
  },
  {
    file: 'apps/admin/.env',
    purpose:
      'Local admin console: where its dev server forwards /admin requests. The secret is typed in the browser, never stored here.',
    settings: {
      // No VITE_ prefix: only vite.config.ts reads it, the browser never does.
      ADMIN_API_URL: derived(
        'API_PORT',
        (port) => `http://127.0.0.1:${port}`,
        (url) => /:(\d+)$/.exec(url)?.[1] ?? url,
      ),
    },
  },
  {
    file: 'services/stripe-webhook/.env',
    purpose:
      'Stripe ingress: verifies the webhook signature and queues references. Only the signing secret.',
    settings: same(
      'LOG_LEVEL',
      'SUBSCRIPTION_QUEUE_URL',
      'STRIPE_WEBHOOK_SECRET',
    ),
  },
  {
    file: 'services/apple-webhook/.env',
    purpose:
      'Apple ingress: verifies signed notifications with public certificates. No private key.',
    settings: {
      ...appleShared,
      ...same('SUBSCRIPTION_QUEUE_URL', 'LOG_LEVEL'),
    },
  },
  {
    file: 'services/google-webhook/.env',
    purpose:
      'Google ingress: verifies Pub/Sub push tokens and queues references. No billing key.',
    settings: {
      ...googleShared,
      ...same(
        'GOOGLE_PLAY_PUSH_AUDIENCE',
        'GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL',
        'GOOGLE_PLAY_PUSH_SUBSCRIPTION',
        'SUBSCRIPTION_QUEUE_URL',
        'LOG_LEVEL',
      ),
    },
  },
  {
    file: 'services/subscription-worker/.env',
    purpose:
      'Worker: reads providers, commits access, acknowledges purchases. Holds the store keys.',
    settings: {
      ...same(
        'LOG_LEVEL',
        'DYNAMODB_TABLE_NAME',
        'DYNAMODB_ENDPOINT',
        'SUBSCRIPTION_QUEUE_URL',
        'STRIPE_SECRET_KEY',
        'STRIPE_PRODUCT_ID',
      ),
      ...appleShared,
      ...appleKey,
      ...googleShared,
      ...same('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE'),
    },
  },
  {
    file: 'apps/web/.env',
    purpose:
      'Website build: public values only. Vite exposes VITE_* variables to the browser.',
    settings: {
      VITE_AUTH0_DOMAIN: 'AUTH0_DOMAIN',
      VITE_AUTH0_CLIENT_ID: 'WEB_AUTH0_CLIENT_ID',
      VITE_AUTH0_AUDIENCE: 'AUTH0_AUDIENCE',
      VITE_API_URL: 'WEB_API_URL',
    },
  },
  {
    file: 'apps/mobile/.env',
    purpose:
      'Mobile app: public EXPO_PUBLIC_* values plus native build settings and the upload key.',
    settings: {
      EXPO_PUBLIC_AUTH0_DOMAIN: 'AUTH0_DOMAIN',
      EXPO_PUBLIC_AUTH0_CLIENT_ID: 'MOBILE_AUTH0_CLIENT_ID',
      EXPO_PUBLIC_AUTH0_AUDIENCE: 'AUTH0_AUDIENCE',
      EXPO_PUBLIC_API_URL: 'MOBILE_API_URL',
      // The store identities and the app identities must match, or purchases
      // and Auth0 callbacks fail; one setting each keeps them equal.
      IOS_BUNDLE_IDENTIFIER: 'APPLE_BUNDLE_ID',
      ANDROID_PACKAGE_NAME: 'GOOGLE_PLAY_PACKAGE_NAME',
      ...same(
        'ANDROID_VERSION_CODE',
        'ANDROID_UPLOAD_KEYSTORE_FILE',
        'ANDROID_UPLOAD_KEYSTORE_PASSWORD',
        'ANDROID_UPLOAD_KEY_ALIAS',
        'ANDROID_UPLOAD_KEY_PASSWORD',
      ),
    },
  },
  {
    file: 'apps/cli/.env',
    purpose:
      'CLI: inspects and reconciles local subscriptions with the provider APIs. Database and queue are fixed to Compose.',
    settings: {
      ...same('STRIPE_SECRET_KEY', 'STRIPE_PRODUCT_ID'),
      ...appleShared,
      ...appleKey,
      ...googleShared,
      ...same('GOOGLE_PLAY_SERVICE_ACCOUNT_FILE'),
    },
  },
  {
    file: 'infra/.env',
    purpose:
      'AWS deployment: public IDs and Secrets Manager ARNs only; secret values never reach CDK.',
    settings: {
      ...same('AWS_PROFILE', 'AWS_REGION', 'AWS_ACCOUNT_ID'),
      AUTH0_ISSUER: auth0Issuer,
      ...same('AUTH0_AUDIENCE', 'STRIPE_SECRET_ARN'),
      // Local and cloud can enable providers independently.
      APPLE_ENABLED: 'CLOUD_APPLE_ENABLED',
      ...same('APPLE_BUNDLE_ID', 'APPLE_PRODUCT_ID', 'APPLE_SECRET_ARN'),
      GOOGLE_PLAY_ENABLED: 'CLOUD_GOOGLE_PLAY_ENABLED',
      ...same(
        'GOOGLE_PLAY_PACKAGE_NAME',
        'GOOGLE_PLAY_PRODUCT_ID',
        'GOOGLE_PLAY_BASE_PLAN_ID',
        'GOOGLE_PLAY_SECRET_ARN',
        'GOOGLE_PLAY_PUSH_SERVICE_ACCOUNT_EMAIL',
      ),
      // The cloud receiver has its own push subscription and audience.
      GOOGLE_PLAY_PUSH_AUDIENCE: 'CLOUD_GOOGLE_PLAY_PUSH_AUDIENCE',
      GOOGLE_PLAY_PUSH_SUBSCRIPTION: 'CLOUD_GOOGLE_PLAY_PUSH_SUBSCRIPTION',
      ...same(
        'RECONCILIATION_STRIPE_ENABLED',
        'RECONCILIATION_APPLE_ENABLED',
        'RECONCILIATION_GOOGLE_ENABLED',
      ),
    },
  },
];

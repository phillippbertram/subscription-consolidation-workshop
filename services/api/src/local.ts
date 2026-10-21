import { readDatabaseConfig } from '@premiumpass/persistence';
import { createLocalAppleBilling } from './billing/apple.js';
import { createGoogleBilling } from './billing/google.js';
import { CheckoutService } from './billing/checkout-service.js';
import { CancellationService } from './billing/cancellation-service.js';
import { StripeBillingProvider } from './billing/stripe-provider.js';
import { readStripeConfig, readWebOrigin } from './billing/config.js';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { readAuthConfig, readLocalConfig } from './config.js';
import { createPersistence } from './persistence.js';
import { createLogger, readLogLevel } from '@premiumpass/logging';
import { readAdminConfig, shortAdminSecretHint } from './admin/config.js';
import { adminRoutes } from './admin/routes.js';

const config = readLocalConfig(process.env);
const logLevel = readLogLevel(process.env, 'debug');
const log = createLogger(logLevel, 'premiumpass-api');
const database = readDatabaseConfig(process.env, true);
const stores = createPersistence(database);
const stripe = readStripeConfig(process.env);
const apple = createLocalAppleBilling(process.env, database);
const google = createGoogleBilling(process.env, database, true);
const admin = readAdminConfig(process.env, database);
const app = createApp({
  auth: readAuthConfig(process.env),
  stores,
  logLevel,
  webOrigin: readWebOrigin(process.env),
  apple,
  google,
  registerAdminRoutes: adminRoutes({
    config: admin,
    database,
    providers: {
      stripe: Boolean(stripe),
      apple: Boolean(apple),
      google: Boolean(google),
    },
  }),
  ...(stripe
    ? {
        checkout: new CheckoutService(
          stores.billing,
          new StripeBillingProvider(stripe.secretKey),
          stripe,
        ),
        cancellation: new CancellationService(
          stores.billing,
          stores.subscriptions,
          new StripeBillingProvider(stripe.secretKey),
        ),
      }
    : {}),
});
const server = serve({ fetch: app.fetch, ...config }, (info) => {
  log.info({
    event: 'server.started',
    url: `http://${config.hostname}:${info.port}`,
    adminRoutes: admin ? 'enabled' : 'disabled (ADMIN_SECRET not set)',
  });
  if (admin?.short) {
    log.warn({ event: 'admin.secret_short', hint: shortAdminSecretHint });
  }
});

server.on('error', (error: Error) => {
  log.error({ event: 'server.failed', message: error.message });
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        log.error({ event: 'server.shutdown_failed', message: error.message });
        process.exitCode = 1;
      }
    });
  });
}

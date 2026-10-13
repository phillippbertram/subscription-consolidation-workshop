import { readDatabaseConfig } from '@premiumpass/persistence';
import { createLocalAppleBilling } from './billing/apple.js';
import { CheckoutService } from './billing/checkout-service.js';
import { StripeBillingProvider } from './billing/stripe-provider.js';
import { readStripeConfig, readWebOrigin } from './billing/config.js';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { readAuthConfig, readLocalConfig } from './config.js';
import { createPersistence } from './persistence.js';
import { createLogger, readLogLevel } from '@premiumpass/logging';

const config = readLocalConfig(process.env);
const logLevel = readLogLevel(process.env, 'debug');
const log = createLogger(logLevel, 'premiumpass-bff');
const database = readDatabaseConfig(process.env, true);
const stores = createPersistence(database);
const stripe = readStripeConfig(process.env);
const app = createApp(
  readAuthConfig(process.env),
  stores,
  logLevel,
  () => new Date(),
  {
    webOrigin: readWebOrigin(process.env),
    apple: createLocalAppleBilling(process.env, database),
    ...(stripe
      ? {
          checkout: new CheckoutService(
            stores.billing,
            new StripeBillingProvider(stripe.secretKey),
            stripe,
          ),
        }
      : {}),
  },
);
const server = serve({ fetch: app.fetch, ...config }, (info) => {
  log.info({
    event: 'server.started',
    url: `http://${config.hostname}:${info.port}`,
  });
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

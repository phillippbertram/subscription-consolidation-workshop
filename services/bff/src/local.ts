import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import {
  readAuthConfig,
  readDatabaseConfig,
  readLocalConfig,
} from './config.js';
import { createUserStore } from './persistence.js';
import { readLogLevel } from './logging.js';

const config = readLocalConfig(process.env);
const app = createApp(
  readAuthConfig(process.env),
  createUserStore(readDatabaseConfig(process.env, true)),
  readLogLevel(process.env, 'debug'),
);
const server = serve({ fetch: app.fetch, ...config }, (info) => {
  console.info(
    `PremiumPass BFF listening on http://${config.hostname}:${info.port}`,
  );
});

server.on('error', (error: Error) => {
  console.error(`BFF server failed: ${error.message}`);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error(`BFF shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
    });
  });
}

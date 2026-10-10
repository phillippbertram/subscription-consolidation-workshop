import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import {
  readAuthConfig,
  readDatabaseConfig,
  readLocalConfig,
} from './config.js';
import { createPersistence } from './persistence.js';
import { createLogger, readLogLevel } from './logging.js';

const config = readLocalConfig(process.env);
const logLevel = readLogLevel(process.env, 'debug');
const log = createLogger(logLevel);
const app = createApp(
  readAuthConfig(process.env),
  createPersistence(readDatabaseConfig(process.env, true)),
  logLevel,
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

import { handle } from '@hono/aws-lambda';
import { createApp } from './app.js';
import { readAuthConfig, readDatabaseConfig } from './config.js';
import { createUserStore } from './persistence.js';
import { readLogLevel } from './logging.js';

export const handler = handle(
  createApp(
    readAuthConfig(process.env),
    createUserStore(readDatabaseConfig(process.env)),
    readLogLevel(process.env),
  ),
);

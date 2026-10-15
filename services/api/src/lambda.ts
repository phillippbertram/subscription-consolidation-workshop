import { readDatabaseConfig } from '@premiumpass/persistence';
import { handle } from '@hono/aws-lambda';
import { createApp } from './app.js';
import { readAuthConfig } from './config.js';
import { createPersistence } from './persistence.js';
import { readLogLevel } from '@premiumpass/logging';

export const handler = handle(
  createApp(
    readAuthConfig(process.env),
    createPersistence(readDatabaseConfig(process.env)),
    readLogLevel(process.env),
  ),
);
